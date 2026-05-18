# No Aggregations in Table - Troubleshooting Guide

## Problem
When you click "Start Stream" in the frontend, no data appears in the dashboard table.

## Data Flow Diagram

```
Frontend (Start Stream)
    ↓
POST /generate
    ↓
EventGeneratorFunction (Lambda)
    ↓
Kinesis Stream (event-stream-pipeline)
    ↓
AggregatorFunction (Lambda) - triggered by Kinesis
    ↓
DynamoDB Table (event-stream-aggregations)
    ↓
MetricsFunction (Lambda)  - /stream endpoint
    ↓
Dashboard (fetches every 3 seconds)
```

## Quick Diagnosis Steps

### Step 1: Check if Events Are Being Generated

**Run the troubleshooting script:**

```bash
# PowerShell
.\troubleshoot.ps1

# Or Bash
bash troubleshoot.sh
```

**Manual check - Count items in DynamoDB:**

```bash
aws dynamodb scan --table-name event-stream-aggregations --select COUNT --output text
```

- **If count > 0**: Data exists! Skip to Step 5 (caching issue)
- **If count = 0**: Events aren't being aggregated. Continue to Step 2

### Step 2: Verify Kinesis is Receiving Events

Check if Generator Lambda ran successfully:

```bash
# View recent logs
aws logs tail /aws/lambda/event-stream-pipeline-EventGeneratorFunction --follow false --max-items 20

# Look for: "✅ Streamed X events to Kinesis"
```

**If you DON'T see "Streamed events":**
- Check that you clicked "Start Stream" button
- Check frontend browser console for errors
- Verify API endpoint in `.env` files is correct

**If you DO see "Streamed events":**
- Continue to Step 3

### Step 3: Verify Aggregator Lambda Received Events

Check Aggregator Lambda logs:

```bash
aws logs tail /aws/lambda/event-stream-pipeline-AggregatorFunction --follow false --max-items 20

# Look for: "✅ Successfully updated X items in DynamoDB"
# Or: "⚠️  Processing error" (if there's an issue)
```

**If you see errors:**

| Error | Solution |
|-------|----------|
| `AGG_TABLE not set` | Lambda env var missing. Run `sam deploy` |
| `User is not authorized` | Lambda needs DynamoDB permissions. Check IAM role |
| `No valid records to process` | Kinesis records are malformed |

**If NO errors but also NO updates:**
- Lambda might not be triggered. Check Kinesis event source mapping:

```bash
aws lambda list-event-source-mappings --function-name event-stream-pipeline-AggregatorFunction
```

Should show status: `Enabled`. If not:

```bash
# Re-enable the mapping
MAPPING_UUID=$(aws lambda list-event-source-mappings --function-name event-stream-pipeline-AggregatorFunction --query 'EventSourceMappings[0].UUID' --output text)
aws lambda update-event-source-mapping --uuid $MAPPING_UUID --state Enabled
```

### Step 4: Check DynamoDB Directly

```bash
# Scan table for items
aws dynamodb scan --table-name event-stream-aggregations --limit 5 --output table

# Count items by prefix (to understand aggregation patterns)
aws dynamodb scan --table-name event-stream-aggregations --projection-expression "id" | jq '.Items[].id.S' | head -20
```

Expected item IDs should start with:
- `live#` - timeline aggregations
- `cat#` - category aggregations
- `campaign#` - campaign aggregations
- `city#` - geographic aggregations
- `age#` - age group aggregations

### Step 5: Clear Cache & Refresh Metrics

The metrics endpoint caches results for 3 seconds. If table was empty when you first started, it might be returning cached empty data.

**Solution**: Clear metrics cache by:

1. Wait 5 seconds (cache TTL)
2. Refresh dashboard (frontend will re-fetch)

OR manually invoke metrics function:

```bash
# Test the /stream endpoint directly
curl https://YOUR-API-ENDPOINT/prod/stream | jq .

# Check the response:
# - Should have totalEvents > 0
# - Should have eventsByType with counts
# - Should have categoryStats, geoStats, etc.
```

## Common Issues & Fixes

### Issue 1: No events generated

**Symptoms:**
- Dashboard stuck on initial load
- No logs in Generator Lambda
- DynamoDB table empty

**Solutions:**

```bash
# Check if frontend is pointing to correct API
cat frontend/.env | grep VITE_API_BASE_URL
cat dashboard-frontend/.env | grep VITE_API_ENDPOINT

# Verify API Gateway endpoint exists
aws apigateway get-rest-apis | jq '.items[] | {name, id}'

# Test the /generate endpoint directly
curl -X POST https://YOUR-API-ENDPOINT/prod/generate \
  -H "Content-Type: application/json" \
  -d '{"action":"start","rate":70000,"duration":10}' | jq .
```

### Issue 2: Events generated but not aggregated

**Symptoms:**
- Generator logs show "✅ Streamed X events"
- But DynamoDB table is empty
- Aggregator Lambda logs show "Processing 0 records"

**Solutions:**

```bash
# Check if Kinesis receiving events
SHARD_ID=$(aws kinesis describe-stream --stream-name event-stream-pipeline --query 'StreamDescription.Shards[0].ShardId' --output text)
ITERATOR=$(aws kinesis get-shard-iterator --stream-name event-stream-pipeline --shard-id $SHARD_ID --shard-iterator-type LATEST --query 'ShardIterator' --output text)

# Get last record
aws kinesis get-records --shard-iterator $ITERATOR | jq '.Records[0]'

# If empty, events aren't reaching Kinesis
# Check Generator Lambda error logs again
```

### Issue 3: Aggregations exist but dashboard shows no data

**Symptoms:**
- DynamoDB has items (count > 0)
- Dashboard shows "[NO DATA]" message
- Browser console shows no errors

**Solutions:**

```bash
# Check metrics endpoint response
curl https://YOUR-API-ENDPOINT/prod/stream -H "Content-Type: application/json" | jq '.totalEvents'

# If totalEvents = 0:
# - Metrics Lambda has stale cache
# - Wait 5 seconds and try again
# - Or check metrics.js logs:
aws logs tail /aws/lambda/event-stream-pipeline-MetricsFunction --follow false --max-items 20

# Look for:
# "Cache HIT" (means it's returning old data)
# "Cache MISS - freshly computed" (means it recomputed)
```

## Full Data Pipeline Test

Run this to test the entire flow end-to-end:

```bash
#!/bin/bash

echo "1️⃣  Clearing DynamoDB table..."
aws dynamodb delete-table --table-name event-stream-aggregations
sleep 5
aws dynamodb create-table --table-name event-stream-aggregations \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
sleep 10

echo "2️⃣  Generating events..."
API_ENDPOINT=$(aws cloudformation describe-stacks --stack-name event-stream-pipeline --query 'Stacks[0].Outputs[?OutputKey==`EventApiEndpoint`].OutputValue' --output text)
curl -X POST "$API_ENDPOINT/generate" \
  -H "Content-Type: application/json" \
  -d '{"action":"start","rate":70000,"duration":10}'

echo "3️⃣  Waiting for aggregation..."
sleep 15

echo "4️⃣  Checking DynamoDB..."
aws dynamodb scan --table-name event-stream-aggregations --select COUNT

echo "5️⃣  Checking metrics endpoint..."
curl "$API_ENDPOINT/stream" | jq '.totalEvents'
```

## Enable Debug Logging

### For Generator Lambda:

Add to event-generator/app/handler.js:

```javascript
console.log("🔍 DEBUG: Event generated", JSON.stringify(event, null, 2));
```

### For Aggregator Lambda:

Already has detailed logging. Check:

```bash
aws logs tail /aws/lambda/event-stream-pipeline-AggregatorFunction --follow false --max-items 50 | grep -E "ERROR|Failed|✅"
```

## Reset Everything

If nothing is working, reset and redeploy:

```bash
# 1. Delete CloudFormation stack
aws cloudformation delete-stack --stack-name event-stream-pipeline
aws cloudformation wait stack-delete-complete --stack-name event-stream-pipeline

# 2. Redeploy
cd C:\AWS-final
sam build
sam deploy --guided

# 3. Wait for deployment
# 4. Test fresh
```

## Contact Points

If still stuck, check these in order:

1. **Event Generator** - `/aws/lambda/event-stream-pipeline-EventGeneratorFunction`
   - Should log "Streamed X events" messages
   
2. **Kinesis Stream** - `event-stream-pipeline`
   - Should have event data flowing through shards
   
3. **Aggregator Lambda** - `/aws/lambda/event-stream-pipeline-AggregatorFunction`
   - Should log "Calling updateAggregationCounts"
   - Should have DynamoDB write permissions
   
4. **DynamoDB Table** -`event-stream-aggregations`
   - Should contain items with ids like `live#YYYY-MM-DDTHH:MM`
   
5. **Metrics Lambda** - `/aws/lambda/event-stream-pipeline-MetricsFunction`
   - `/stream` endpoint should return data
   - Check cache status in response headers

---

**Last Updated**: December 15, 2024
