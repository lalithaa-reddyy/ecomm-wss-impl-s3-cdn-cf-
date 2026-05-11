const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { KinesisClient, ListShardsCommand, GetShardIteratorCommand, GetRecordsCommand } = require("@aws-sdk/client-kinesis");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient());
const kinesis = new KinesisClient();

async function checkStatus() {
  console.log("\n📊 === PIPELINE STATUS ===\n");

  // 1. Check generator state
  console.log("1️⃣ GENERATOR STATE:");
  try {
    const genState = await ddb.send(new GetCommand({
      TableName: "event-generator-state",
      Key: { generatorId: "default" }
    }));
    console.log("   Status:", genState.Item?.status || "NO STATE");
    console.log("   Rate:", genState.Item?.rate || "N/A");
    console.log("   Started:", genState.Item?.startTime || "N/A");
    console.log("   Last Updated:", genState.Item?.lastUpdated || "N/A");
  } catch (e) {
    console.error("   ❌ Error:", e.message);
  }

  // 2. Check Kinesis stream
  console.log("\n2️⃣ KINESIS STREAM:");
  try {
    const shards = await kinesis.send(new ListShardsCommand({
      StreamName: "event-stream-pipeline"
    }));
    console.log("   Shards:", shards.Shards?.length || 0);
    
    if (shards.Shards?.length > 0) {
      const shardId = shards.Shards[0].ShardId;
      const iterator = await kinesis.send(new GetShardIteratorCommand({
        StreamName: "event-stream-pipeline",
        ShardId: shardId,
        ShardIteratorType: "LATEST"
      }));
      
      const records = await kinesis.send(new GetRecordsCommand({
        ShardIterator: iterator.ShardIterator
      }));
      console.log("   Records in latest position:", records.Records?.length || 0);
    }
  } catch (e) {
    console.error("   ❌ Error:", e.message);
  }

  // 3. Check DynamoDB aggregations table
  console.log("\n3️⃣ DYNAMODB AGGREGATIONS:");
  try {
    const scan = await ddb.send(new ScanCommand({
      TableName: "event-stream-aggregations",
      Limit: 5
    }));
    console.log("   Items in table:", scan.Count || 0);
    console.log("   Total items (approx):", scan.ScannedCount || 0);
    if (scan.Items?.length > 0) {
      console.log("   Sample item IDs:");
      scan.Items.slice(0, 3).forEach(item => {
        console.log("     -", item.id);
      });
    }
  } catch (e) {
    console.error("   ❌ Error:", e.message);
  }

  console.log("\n✅ Status check complete\n");
}

checkStatus().catch(console.error);
