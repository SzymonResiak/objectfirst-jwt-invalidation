# Decentralized JWT Session Invalidation

## Problem

JWT tokens are stateless, once issued, they're valid until expiration. If a session needs to be revoked before that, every service instance must know about it without querying a central database on each request.

This project solves that by having each Application Service maintain a local in memory blacklist, synchronized via SNS push events with a DynamoDB fallback for crash recovery.

## Architecture

```
              CLIENT
         ┌──────┴──────┐
         │             │
    POST /login   GET /whoami
    POST /invalidate   │
         │             │
         ▼             ▼
  ┌────────────┐  ┌────────┐
  │  SESSION   │  │  ALB   │
  │  MANAGER   │  └───┬────┘
  └──┬──────┬──┘ ┌────┴────┐
     │      │    │         │
     ▼      │    ▼         ▼
┌────────┐  │ ┌──────┐ ┌──────┐
│DynamoDB│  │ │App #1│ │App #2│
└────────┘  │ │cache │ │cache │
            │ └──▲───┘ └───▲──┘
            ▼    │         │
         ┌──SNS──┘         │
         └─────────────────┘
           HTTP POST
```

**Session Manager** — issues JWTs (RS256), stores sessions in DynamoDB, publishes invalidation events to SNS.

**Application Service** (x2, behind ALB) — verifies JWTs locally using the public key, checks an in-memory blacklist. No database calls per request.

**SNS** — pushes invalidation events directly to each App Service instance IP (not through ALB).

**DynamoDB** — persistent session store. Used as a write-path by Session Manager and as a one-time fallback read by App Service on startup.

## API

| Endpoint | Service | Description |
|---|---|---|
| `POST /login` | Session Manager | Returns JWT. Credentials: `admin` / `password123` |
| `POST /session/:id/invalidate` | Session Manager | Invalidates a session, notifies all App Services |
| `GET /whoami` | App Service (ALB) | Returns `{ serviceName, sessionId, jwtExp }` or 401 |

401 responses include a reason: `"Token expired"`, `"Invalid token signature"`, or `"Session has been invalidated"`.

## Deploy

```bash
cd terraform && terraform init && terraform apply

aws ecr get-login-password --region eu-central-1 \
  | docker login --username AWS --password-stdin <account-id>.dkr.ecr.eu-central-1.amazonaws.com

cd session-manager && docker build -t <ecr-url>:latest . && docker push <ecr-url>:latest
cd ../app-service && npm install && docker build -t <ecr-url>:latest . && docker push <ecr-url>:latest

terraform apply \
  -var="session_manager_image=<ecr-session-manager-url>:latest" \
  -var="app_service_image=<ecr-app-service-url>:latest"
```

## Verify

```bash
TOKEN=$(curl -s -X POST http://<session-manager-ip>:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}' | jq -r '.token')

curl -s http://<alb-dns>/whoami -H "Authorization: Bearer $TOKEN"           # 200

SESSION_ID=$(echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | jq -r '.sessionId')
curl -s -X POST http://<session-manager-ip>:3000/session/$SESSION_ID/invalidate

curl -s http://<alb-dns>/whoami -H "Authorization: Bearer $TOKEN"           # 401
```

## What i have tested

- Login works → `POST /login` returns a JWT
- Wrong password on `POST /login` → 401
- Valid token on `GET /whoami` → 200 with session info
- No token / tampered token on `GET /whoami` → 401
- `POST /session/:id/invalidate` → `GET /whoami` starts returning 401 `Session has been invalidated`
- `POST /session/:id/invalidate` with non-existent id → 404
- Wait 3 min, call `GET /whoami` with the same token → 401 `Token expired`

## Design decisions

**Why SNS and not SQS?** With SQS, only one consumer picks up each message — so if there are two App Service instances, only one would learn about the invalidation. We could work around this by creating a dedicated queue per instance, but that doesn't autoscale — every time we add or remove an App Service, we'd need to manage queues. On top of that, SQS relies on polling, which introduces a delay. During that window, requests could slip through with an invalidated token before the cache catches up. SNS HTTP push broadcasts to all instances instantly.

**Why scan DynamoDB on startup?** This is the tradeoff of not using per-instance SQS queues, missed events would wait in the queue and get processed after restart. With SNS HTTP push, if an App Service crashes, the events are lost. So on boot it does one DynamoDB scan to catch up on any invalidations it missed. After that, it never touches the database again.

**Why RSA keys instead of a shared secret?** With a symmetric key (HS256), any service that can verify a token can also create one. With RSA, only Session Manager holds the private key and can sign. App Services only have the public key — they can verify but can't forge tokens.

**Why short token lifetime?** 3 minutes means the invalidation cache stays tiny and cleans itself up quickly. Once a token expires naturally, we don't need to remember it was revoked.
