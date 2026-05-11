#!/bin/bash

# Troubleshooting Script: Debug Event Stream Data Flow
# Usage: bash troubleshoot.sh

set -e

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║       Event Stream Troubleshooting - Data Flow Check          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"

# 1. Check AWS Credentials
echo ""
echo "📝 Step 1: Verify AWS Credentials"
echo "─────────────────────────────────"
aws sts get-caller-identity --query 'Account' --output text > /tmp/account.txt
ACCOUNT=$(cat /tmp/account.txt)
REGION=$(aws configure get region)
echo "✅ AWS Account: $ACCOUNT"
echo "✅ AWS Region: $REGION"

# 2. Check Kinesis Stream
echo ""
echo "📊 Step 2: Check Kinesis Stream"
echo "─────────────────────────────────"
STREAM_NAME=$(aws cloudformation describe-stacks --stack-name event-stream-pipeline --query 'Stacks[0].Outputs[?OutputKey==`EventStreamName`].OutputValue' --output text 2>/dev/null || echo "NOT FOUND")
if [ "$STREAM_NAME" = "NOT FOUND" ] || [ -z "$STREAM_NAME" ]; then
  echo "❌ Kinesis stream not found - run 'sam deploy' first"
  exit 1
fi
echo "✅ Kinesis Stream: $STREAM_NAME"

# Get stream status
STREAM_STATUS=$(aws kinesis describe-stream --stream-name "$STREAM_NAME" --query 'StreamDescription.StreamStatus' --output text)
echo "✅ Stream Status: $STREAM_STATUS"

# Check shard info
SHARD_COUNT=$(aws kinesis describe-stream --stream-name "$STREAM_NAME" --query 'StreamDescription.Shards | length(@)' --output text)
echo "✅ Shard Count: $SHARD_COUNT"

# Check if there are records in the stream (iterator age)
echo ""
echo "📮 Kinesis Records Check:"
SHARD_ID=$(aws kinesis describe-stream --stream-name "$STREAM_NAME" --query 'StreamDescription.Shards[0].ShardId' --output text)
SHARD_ITERATOR=$(aws kinesis get-shard-iterator --stream-name "$STREAM_NAME" --shard-id "$SHARD_ID" --shard-iterator-type LATEST --query 'ShardIterator' --output text)
echo "  Shard ID: $SHARD_ID"
echo "  (Latest records will appear on next check)"

# 3. Check DynamoDB Table
echo ""
echo "📦 Step 3: Check DynamoDB Table"
echo "─────────────────────────────────"
TABLE_NAME=$(aws cloudformation describe-stacks --stack-name event-stream-pipeline --query 'Stacks[0].Outputs[?OutputKey==`AggregationTableName`].OutputValue' --output text 2>/dev/null || echo "NOT FOUND")
if [ "$TABLE_NAME" = "NOT FOUND" ] || [ -z "$TABLE_NAME" ]; then
  echo "❌ DynamoDB table not found"
  exit 1
fi
echo "✅ DynamoDB Table: $TABLE_NAME"

# Get item count
ITEM_COUNT=$(aws dynamodb scan --table-name "$TABLE_NAME" --select COUNT --output text | tail -1)
echo "✅ Items in Table: $ITEM_COUNT"

if [ "$ITEM_COUNT" -gt 0 ]; then
  echo "✅ TABLE HAS DATA! Querying sample items..."
  
  # Get a few sample items
  echo ""
  echo "📋 Sample Items from DynamoDB:"
  aws dynamodb scan --table-name "$TABLE_NAME" --limit 5 --output table 2>/dev/null || echo "  [Could not read items]"
  
else
  echo "⚠️  TABLE IS EMPTY - No aggregations found"
  echo "   This means:"
  echo "   1. Events haven't been generated yet (or)"
  echo "   2. Events were generated but not processed by Aggregator Lambda"
fi

# 4. Check Lambda Functions
echo ""
echo "🔧 Step 4: Check Lambda Functions"
echo "──────────────────────────────────"

GENERATOR_FN=$(aws cloudformation describe-stacks --stack-name event-stream-pipeline --query 'Stacks[0].Outputs[?OutputKey==`EventGeneratorFunctionArn`].OutputValue' --output text | sed 's/:$//' | rev | cut -d: -f1 | rev)
AGGREGATOR_FN=$(aws cloudformation describe-stacks --stack-name event-stream-pipeline --query 'Stacks[0].Outputs[?OutputKey==`AggregatorFunctionArn`].OutputValue' --output text | sed 's/:$//' | rev | cut -d: -f1 | rev)
METRICS_FN=$(aws cloudformation describe-stacks --stack-name event-stream-pipeline --query 'Stacks[0].Outputs[?OutputKey==`MetricsFunctionArn`].OutputValue' --output text | sed 's/:$//' | rev | cut -d: -f1 | rev)

echo "✅ Event Generator: $GENERATOR_FN"
echo "✅ Aggregator: $AGGREGATOR_FN"
echo "✅ Metrics: $METRICS_FN"

# 5. Check CloudWatch Logs
echo ""
echo "📋 Step 5: Recent CloudWatch Logs"
echo "──────────────────────────────────"

echo ""
echo "📤 Generator Lambda Logs (last 20 lines):"
aws logs tail "/aws/lambda/$GENERATOR_FN" --follow false --max-items 20 2>/dev/null | tail -10 || echo "  [No recent logs]"

echo ""
echo "⚙️  Aggregator Lambda Logs (last 20 lines):"
aws logs tail "/aws/lambda/$AGGREGATOR_FN" --follow false --max-items 20 2>/dev/null | tail -10 || echo "  [No recent logs]"

echo ""
echo "📊 Metrics Lambda Logs (last 20 lines):"
aws logs tail "/aws/lambda/$METRICS_FN" --follow false --max-items 20 2>/dev/null | tail -10 || echo "  [No recent logs]"

# 6. Test Metrics Endpoint
echo ""
echo "✅ Step 6: Test Metrics Endpoint"
echo "──────────────────────────────────"

API_ENDPOINT=$(aws cloudformation describe-stacks --stack-name event-stream-pipeline --query 'Stacks[0].Outputs[?OutputKey==`EventApiEndpoint`].OutputValue' --output text 2>/dev/null || echo "NOT FOUND")
if [ "$API_ENDPOINT" != "NOT FOUND" ] && [ -n "$API_ENDPOINT" ]; then
  echo "📡 API Endpoint: $API_ENDPOINT"
  echo ""
  echo "Testing /stream endpoint..."
  RESPONSE=$(curl -s "$API_ENDPOINT/stream" -H "Content-Type: application/json" | head -100)
  echo "$RESPONSE" | jq . 2>/dev/null || echo "Response (raw): $RESPONSE"
else
  echo "❌ Could not find API endpoint"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                   Troubleshooting Complete                     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
