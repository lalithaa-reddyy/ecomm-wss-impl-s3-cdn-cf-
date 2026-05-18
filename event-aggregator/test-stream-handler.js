process.env.AGG_TABLE = 'event-stream-aggregations';
process.env.SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:596430611165:event-stream-anomalies';

const h = require('./src/handlers/stream.js').handler;
const sampleEvent = {
  Records: [{
    kinesis: {
      data: Buffer.from(JSON.stringify({
        eventId: "test1",
        userId: "user1",
        eventType: "view",
        timestamp: "2026-04-15T08:15:00Z",
        productCategory: "Electronics"
      })).toString('base64')
    }
  }]
};

h(sampleEvent)
  .then(r => console.log('SUCCESS:', JSON.stringify(r)))
  .catch(e => console.error('ERROR:', e.message, e.stack));
