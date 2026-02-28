const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const client = new SNSClient({ region: process.env.AWS_REGION || 'eu-central-1' });
const TOPIC_ARN = process.env.SNS_TOPIC_ARN;

async function publishInvalidation({ sessionId, expiration }) {
  await client.send(new PublishCommand({
    TopicArn: TOPIC_ARN,
    Message: JSON.stringify({ sessionId, expiration }),
    Subject: 'session-invalidation',
  }));
}

module.exports = { publishInvalidation };
