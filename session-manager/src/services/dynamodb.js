const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'eu-central-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'sessions';

async function createSession({ sessionId, username, expiration }) {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      sessionId,
      username,
      expiration,
      isSessionInvalidated: false,
    },
  }));
}

async function getSession(sessionId) {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { sessionId },
  }));
  return result.Item || null;
}

async function invalidateSession(sessionId) {
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { sessionId },
    UpdateExpression: 'SET isSessionInvalidated = :val',
    ConditionExpression: 'attribute_exists(sessionId)',
    ExpressionAttributeValues: { ':val': true },
  }));
}

module.exports = { createSession, getSession, invalidateSession };
