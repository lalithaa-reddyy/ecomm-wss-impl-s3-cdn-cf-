const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  const { connectionId } = event.requestContext;

  await ddb.send(new PutCommand({
    TableName: process.env.CONNECTIONS_TABLE,
    Item: {
      connectionId,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      connectedAt: new Date().toISOString()
    }
  }));

  return { statusCode: 200, body: "Connected" };
};
