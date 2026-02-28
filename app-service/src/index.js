const express = require('express');
const http = require('http');
const whoamiRouter = require('./routes/whoami');
const eventsRouter = require('./routes/events');
const { subscribe, unsubscribe } = require('./services/sns');
const { getInvalidatedSessions } = require('./services/dynamodb');
const { addInvalidation, startCleanup, stopCleanup } = require('./services/cache');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(eventsRouter);
app.use(express.json());
app.use(whoamiRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);

async function getTaskIp() {
  const metadataUri = process.env.ECS_CONTAINER_METADATA_URI_V4;
  if (!metadataUri) {
    console.log('ECS metadata not available, using localhost');
    return '127.0.0.1';
  }

  const response = await fetch(`${metadataUri}/task`);
  const metadata = await response.json();
  const container = metadata.Containers.find(c => c.Networks && c.Networks.length > 0);
  if (container) {
    return container.Networks[0].IPv4Addresses[0];
  }
  throw new Error('Could not determine task IP from ECS metadata');
}

async function startup() {
  // Fallback: load invalidated sessions from DynamoDB
  try {
    const sessions = await getInvalidatedSessions();
    for (const session of sessions) {
      addInvalidation(session.sessionId, session.expiration);
    }
    console.log(`Loaded ${sessions.length} invalidated sessions from DynamoDB`);
  } catch (err) {
    console.error('Failed to load invalidated sessions from DynamoDB:', err.message);
  }

  // Start periodic cache cleanup
  startCleanup();

  // Register with SNS
  try {
    const ip = await getTaskIp();
    const endpoint = `http://${ip}:${PORT}/events`;
    await subscribe(endpoint);
    console.log(`Subscribed to SNS with endpoint: ${endpoint}`);
  } catch (err) {
    console.error('Failed to subscribe to SNS:', err.message);
  }
}

server.listen(PORT, async () => {
  console.log(`App Service listening on port ${PORT}`);
  await startup();
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down...');
  stopCleanup();
  try {
    await unsubscribe();
  } catch (err) {
    console.error('Failed to unsubscribe from SNS:', err.message);
  }
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
