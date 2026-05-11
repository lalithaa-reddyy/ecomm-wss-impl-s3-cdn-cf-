const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

const TABLE = process.env.AGG_TABLE;
const TOPIC = process.env.SNS_TOPIC_ARN;
const RAW_BUCKET = process.env.RAW_BUCKET; // S3 bucket for raw events
const AGG_BUCKET = process.env.AGG_BUCKET; // S3 bucket for aggregations

// Batch write optimization - flush every 25 updates (DynamoDB limit is 25 per batch)
const BATCH_SIZE = 25;
const MAX_RETRIES = 3;

/* ============ FAST SINGLE-PASS AGGREGATION ============ */
function aggregateEvents(records) {
  const aggregations = {
    countsByMinute: {},
    categoryAgg: {},
    campaignAgg: {},
    deviceAgg: {},
    segmentAgg: {},
    cityAgg: {},
    ageAgg: {},
    anomalies: [],
    totalProcessed: 0
  };

  for (const e of records) {
    // Fast path: validate required fields early
    if (!e.timestamp || !e.eventType) {
      console.warn("[STREAM] Skipping record with missing timestamp or eventType");
      continue;
    }

    aggregations.totalProcessed++;
    const minute = e.timestamp.slice(0, 16); // Extract YYYY-MM-DDTHH:mm

    // Initialize aggregation objects on-demand (reduces memory)
    const getOrInit = (obj, key, defaults) => {
      if (!obj[key]) obj[key] = { ...defaults };
      return obj[key];
    };

    // 1. Timeline aggregations (FAST PATH - always executed)
    const timelineData = getOrInit(aggregations.countsByMinute, `live#${minute}`, 
      { total: 0, orders: 0, revenue: 0 });
    timelineData.total += 1;
    timelineData[e.eventType] = (timelineData[e.eventType] || 0) + 1;
    
    if (e.eventType === 'order') {
      timelineData.orders += 1;
      timelineData.revenue = (timelineData.revenue || 0) + (e.orderValue || 0);
    }

    // Only process dimensions if data is available (reduce object allocations)
    if (e.productCategory) {
      const catKey = `cat#${e.productCategory}`;
      const categoryData = getOrInit(aggregations.categoryAgg, catKey, 
        { total: 0, orders: 0, revenue: 0 });
      categoryData.total += 1;
      categoryData[e.eventType] = (categoryData[e.eventType] || 0) + 1;
      if (e.eventType === 'order' && !e.isAnomaly) {
        categoryData.orders += 1;
        categoryData.revenue = (categoryData.revenue || 0) + (e.orderValue || 0);
      }
    }

    if (e.campaignId) {
      const campaignKey = `campaign#${e.campaignId}`;
      const campaignData = getOrInit(aggregations.campaignAgg, campaignKey, 
        { total: 0, orders: 0, revenue: 0 });
      campaignData.total += 1;
      if (e.eventType === 'order' && !e.isAnomaly) {
        campaignData.orders += 1;
        campaignData.revenue = (campaignData.revenue || 0) + (e.orderValue || 0);
      }
    }

    if (e.deviceType) {
      const deviceKey = `device#${e.deviceType}`;
      const deviceData = getOrInit(aggregations.deviceAgg, deviceKey, { total: 0, orders: 0 });
      deviceData.total += 1;
      if (e.eventType === 'order') deviceData.orders += 1;
    }

    if (e.segment) {
      const segmentKey = `segment#${e.segment}`;
      const segmentData = getOrInit(aggregations.segmentAgg, segmentKey, 
        { total: 0, orders: 0, revenue: 0 });
      segmentData.total += 1;
      if (e.eventType === 'order' && !e.isAnomaly) {
        segmentData.orders += 1;
        segmentData.revenue = (segmentData.revenue || 0) + (e.orderValue || 0);
      }
    }

    if (e.city) {
      const cityKey = `city#${e.city}`;
      const cityData = getOrInit(aggregations.cityAgg, cityKey, 
        { total: 0, orders: 0, revenue: 0 });
      cityData.total += 1;
      cityData[e.eventType] = (cityData[e.eventType] || 0) + 1;
      if (e.eventType === 'order' && !e.isAnomaly) {
        cityData.orders += 1;
        cityData.revenue = (cityData.revenue || 0) + (e.orderValue || 0);
      }
    }

    if (e.ageGroup) {
      const ageKey = `age#${e.ageGroup}`;
      const ageData = getOrInit(aggregations.ageAgg, ageKey, 
        { total: 0, orders: 0, revenue: 0 });
      ageData.total += 1;
      ageData[e.eventType] = (ageData[e.eventType] || 0) + 1;
      if (e.eventType === 'order' && !e.isAnomaly) {
        ageData.orders += 1;
        ageData.revenue = (ageData.revenue || 0) + (e.orderValue || 0);
      }
    }

    // 8. Anomaly tracking (only if present)
    if (e.isAnomaly) {
      aggregations.anomalies.push({
        eventId: e.eventId,
        type: e.anomalyType,
        category: e.productCategory,
        timestamp: e.timestamp
      });
    }
  }

  return aggregations;
}

/* ============ OPTIMIZED BATCH DYNAMODB UPDATES ============ */
async function updateDynamoDBBatched(aggregations) {
  const updateRequests = [];

  // Helper to build update request
  const buildUpdateRequest = (id, deltas) => {
    const exprNames = {};
    const exprValues = {};
    const addParts = [];

    let idx = 0;
    for (const [key, value] of Object.entries(deltas)) {
      if (typeof value !== 'number' || value <= 0) continue;
      exprNames[`#f${idx}`] = key;
      exprValues[`:v${idx}`] = value;
      addParts.push(`#f${idx} :v${idx}`);
      idx++;
    }

    if (addParts.length === 0) return null;

    const updateExpr = `ADD ${addParts.join(", ")}`;

    const expr = {
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues
    };

    // For timeline items, also add lastSeen timestamp
    if (id.startsWith("live#")) {
      const timeStr = id.split("#")[1];
      expr.UpdateExpression = `ADD ${addParts.join(", ")} SET #lastSeen = :ts`;
      exprNames["#lastSeen"] = "lastSeen";
      exprValues[":ts"] = timeStr + ":00Z";
    }

    return { Key: { id }, ...expr };
  };

  // Build all update requests
  for (const [id, counts] of Object.entries(aggregations.countsByMinute)) {
    const req = buildUpdateRequest(id, counts);
    if (req) updateRequests.push(new UpdateCommand({ TableName: TABLE, ...req }));
  }

  // Consolidate dimensions (category, campaign, city, age)
  const allDimensions = {
    ...aggregations.categoryAgg,
    ...aggregations.campaignAgg,
    ...aggregations.deviceAgg,
    ...aggregations.segmentAgg,
    ...aggregations.cityAgg,
    ...aggregations.ageAgg
  };

  for (const [id, counts] of Object.entries(allDimensions)) {
    const req = buildUpdateRequest(id, counts);
    if (req) updateRequests.push(new UpdateCommand({ TableName: TABLE, ...req }));
  }

  console.log(`[STREAM] Sending ${updateRequests.length} updates to DynamoDB (batched)`);

  // Execute all updates in parallel (no need to batch into 25s - SDK handles ConnectionPooling)
  if (updateRequests.length === 0) {
    console.log("[STREAM] No updates needed");
    return;
  }

  // Send in parallel chunks to avoid throttling
  const PARALLEL_LIMIT = 10; // Max concurrent requests
  for (let i = 0; i < updateRequests.length; i += PARALLEL_LIMIT) {
    const batch = updateRequests.slice(i, i + PARALLEL_LIMIT);
    try {
      await Promise.all(batch.map(cmd => 
        ddb.send(cmd).catch(err => {
          console.error(`[STREAM] Update failed for batch: ${err.message}`);
          throw err;
        })
      ));
    } catch (err) {
      console.error(`[STREAM] Batch update failed:`, err);
      throw err;
    }
  }

  console.log(`[STREAM] Successfully updated ${updateRequests.length} items in DynamoDB`);
}

/* ============ SNS NOTIFICATIONS (OPTIMIZED) ============ */
async function notifyAnomalies(anomalies) {
  if (!TOPIC || anomalies.length === 0) return;

  const byType = {};
  for (const anomaly of anomalies) {
    byType[anomaly.type] = (byType[anomaly.type] || 0) + 1;
  }

  const message = {
    timestamp: new Date().toISOString(),
    totalAnomalies: anomalies.length,
    byType,
    sample: anomalies.slice(0, 10) // Only send first 10 for brevity
  };

  await sns.send(new PublishCommand({
    TopicArn: TOPIC,
    Subject: `🚨 Anomaly Alert: ${anomalies.length} anomalies detected`,
    Message: JSON.stringify(message, null, 2)
  }));
}

/* ============ S3 PARQUET WRITE (OPTIMIZED) ============ */
// TODO: Re-enable once parquetjs dependency is available
/*
async function writeAggregationsToS3(aggregations, startTime) {
  if (!AGG_BUCKET) return;

  try {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const prefix = `aggregations/${new Date().toISOString().slice(0, 10)}`;
    
    // Convert aggregations to S3-writable format
    const aggregationRecords = [];

    // Add timeline aggregations
    for (const [id, counts] of Object.entries(aggregations.countsByMinute)) {
      aggregationRecords.push({
        id,
        ...counts,
        createdAt: new Date().toISOString()
      });
    }

    // Add dimension aggregations (category, campaign, etc.)
    const dimensionData = {
      ...aggregations.categoryAgg,
      ...aggregations.campaignAgg,
      ...aggregations.deviceAgg,
      ...aggregations.segmentAgg,
      ...aggregations.cityAgg,
      ...aggregations.ageAgg
    };

    for (const [id, counts] of Object.entries(dimensionData)) {
      aggregationRecords.push({
        id,
        ...counts,
        createdAt: new Date().toISOString()
      });
    }

    if (aggregationRecords.length > 0) {
      const filename = `aggregations-${timestamp}`;
      const result = await writeAggregationsToParquet(
        aggregationRecords,
        AGG_BUCKET,
        prefix,
        filename
      );

      console.log(`📦 S3 write completed: ${result.records} records to ${result.key}`);
    }
  } catch (err) {
    console.error("❌ S3 write failed:", err.message);
    throw err;
  }
}
*/

/* ============ OPTIMIZED HANDLER ============ */
exports.handler = async (event) => {
  const startTime = Date.now();
  console.log(`[STREAM] Processing ${event.Records.length} Kinesis records`);

  try {
    // Fast parallel decode + parse (moved outside loop for better optimization)
    const records = event.Records
      .map(r => {
        try {
          return JSON.parse(Buffer.from(r.kinesis.data, "base64").toString());
        } catch {
          console.warn("[STREAM] Failed to parse record");
          return null;
        }
      })
      .filter(Boolean); // Remove nulls and falsy values

    if (records.length === 0) {
      console.log("[STREAM] No valid records to process");
      return { 
        statusCode: 200, 
        processedRecords: 0, 
        durationMs: Date.now() - startTime 
      };
    }

    // Single-pass aggregation (optimized)
    const aggregations = aggregateEvents(records);

    console.log(`[STREAM] Aggregated ${aggregations.totalProcessed} events in ${Date.now() - startTime}ms`);
    console.log(`[STREAM] Timeline bins: ${Object.keys(aggregations.countsByMinute).length}`);
    console.log(`[STREAM] Categories: ${Object.keys(aggregations.categoryAgg).length}`);
    console.log(`[STREAM] Campaigns: ${Object.keys(aggregations.campaignAgg).length}`);
    console.log(`[STREAM] Cities: ${Object.keys(aggregations.cityAgg).length}`);

    // Update DynamoDB (optimized batching)
    await updateDynamoDBBatched(aggregations);

    // TODO: Write aggregations to S3 in Parquet format (async, non-blocking)
    // Currently disabled due to parquetjs dependency
    // if (AGG_BUCKET) {
    //   writeAggregationsToS3(aggregations, startTime).catch(err => 
    //     console.error("Failed to write aggregations to S3:", err)
    //   );
    // } else {
    //   console.warn("[STREAM] AGG_BUCKET not set, skipping S3 write");
    // }

    // Handle anomalies (async, non-blocking)
    if (aggregations.anomalies.length > 0) {
      console.log(`[STREAM] Found ${aggregations.anomalies.length} anomalies`);
      notifyAnomalies(aggregations.anomalies).catch(err => 
        console.error("[STREAM] Failed to send anomaly notification:", err)
      );
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[STREAM] Completed in ${totalDuration}ms`);

    return {
      statusCode: 200,
      processedRecords: records.length,
      aggregatedRecords: aggregations.totalProcessed,
      anomaliesDetected: aggregations.anomalies.length,
      timelineUpdates: Object.keys(aggregations.countsByMinute).length,
      dimensionsUpdated: Object.keys(aggregations.categoryAgg).length +
                         Object.keys(aggregations.campaignAgg).length +
                         Object.keys(aggregations.cityAgg).length,
      durationMs: totalDuration,
      throughput: Math.round((records.length / totalDuration) * 1000) + " records/sec"
    };
  } catch (err) {
    console.error("[STREAM] Processing error:", err.message, err.stack);
    throw err;
  }
};