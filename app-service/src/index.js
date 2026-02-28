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

async function getTaskPublicIp() {
  const metadataUri = process.env.ECS_CONTAINER_METADATA_URI_V4;
  if (!metadataUri) {
    console.log('ECS metadata not available, using localhost');
    return '127.0.0.1';
  }

  const { EC2Client, DescribeNetworkInterfacesCommand } = require('@aws-sdk/client-ec2');
  const ec2 = new EC2Client({ region: process.env.AWS_REGION || 'eu-central-1' });

  // Get the ENI attachment from task metadata
  const taskResponse = await fetch(`${metadataUri}/task`);
  const taskMetadata = await taskResponse.json();
  const container = taskMetadata.Containers.find(c => c.Networks && c.Networks.length > 0);
  if (!container) {
    throw new Error('Could not find container network info');
  }

  const privateIp = container.Networks[0].IPv4Addresses[0];

  // Look up the ENI by private IP to find the associated public IP
  const result = await ec2.send(new DescribeNetworkInterfacesCommand({
    Filters: [{ Name: 'private-ip-address', Values: [privateIp] }],
  }));

  const eni = result.NetworkInterfaces[0];
  if (eni && eni.Association && eni.Association.PublicIp) {
    return eni.Association.PublicIp;
  }

  throw new Error(`No public IP found for private IP ${privateIp}`);
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
    const ip = await getTaskPublicIp();
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
