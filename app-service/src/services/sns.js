const { SNSClient, SubscribeCommand, UnsubscribeCommand, ConfirmSubscriptionCommand } = require('@aws-sdk/client-sns');

const client = new SNSClient({ region: process.env.AWS_REGION || 'eu-central-1' });
const TOPIC_ARN = process.env.SNS_TOPIC_ARN;

let subscriptionArn = null;

async function subscribe(endpoint) {
  const result = await client.send(new SubscribeCommand({
    TopicArn: TOPIC_ARN,
    Protocol: 'http',
    Endpoint: endpoint,
  }));
  subscriptionArn = result.SubscriptionArn;
  console.log(`SNS subscribe requested, arn: ${subscriptionArn}`);
}

async function confirmSubscription(token) {
  const result = await client.send(new ConfirmSubscriptionCommand({
    TopicArn: TOPIC_ARN,
    Token: token,
  }));
  subscriptionArn = result.SubscriptionArn;
  console.log(`SNS subscription confirmed, arn: ${subscriptionArn}`);
}

async function unsubscribe() {
  if (subscriptionArn && subscriptionArn !== 'pending confirmation') {
    await client.send(new UnsubscribeCommand({
      SubscriptionArn: subscriptionArn,
    }));
    console.log('SNS unsubscribed');
  }
}

module.exports = { subscribe, confirmSubscription, unsubscribe };
