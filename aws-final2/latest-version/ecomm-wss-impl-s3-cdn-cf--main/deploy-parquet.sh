#!/bin/bash

# Quick deployment script for Parquet S3 implementation

set -e

echo "🚀 Deploying Event Stream with Parquet S3 Support..."

# Step 1: Install dependencies
echo ""
echo "📦 Installing dependencies..."
cd event-aggregator
npm install
cd ..

# Step 2: Build SAM
echo ""
echo "🔨 Building SAM application..."
sam build

# Step 3: Deploy
echo ""
echo "🌍 Deploying CloudFormation stack..."
sam deploy --guided

# Step 4: Output S3 bucket information
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📂 S3 Buckets created:"
aws cloudformation describe-stacks --stack-name event-stream-pipeline --query 'Stacks[0].Outputs[?OutputKey==`RawEventsBucketName` || OutputKey==`AggregationsBucketName`]' --output table

echo ""
echo "📝 Check logs:"
echo "  tail -f /aws/lambda/event-stream-pipeline-AggregatorFunction"

echo ""
echo "🎯 Next steps:"
echo "  1. Send events via: POST https://<api>/prod/stream with {action: 'start', rate: 1000}"
echo "  2. Monitor S3 for Parquet files in aggregations/ folder"
echo "  3. Query with AWS Athena or download locally"
