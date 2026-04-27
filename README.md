# Event Stream Pipeline

A fully serverless AWS event streaming platform that generates events, aggregates them in real-time, and provides metrics visualization through a web dashboard.

## Architecture Overview

The system is divided into three stages:

```
Stage 1: Event Generation → Stage 2: Aggregation → Stage 3: Metrics API
         (Lambda)              (Lambda)              (Lambda)
            ↓                      ↓                    ↓
       Kinesis Stream         DynamoDB Table      REST API + WebSocket
         (50 shards)          (Aggregations)         (API Gateway)
            ↓                      ↓                    ↓
        S3 Bucket          S3 Bucket (Parquet)   Dashboard/Generator UI
     (Raw Events)        (Aggregated Data)      (CloudFront + S3)
```

### Components

- **Event Generator**: Lambda function that generates synthetic events on-demand and stores raw event data in Parquet format to S3
- **Event Aggregator**: Lambda function triggered by Kinesis stream events that aggregates data and stores results in DynamoDB and S3
- **Metrics API**: Lambda function serving metrics via REST API and WebSocket for real-time dashboard updates
- **Generator UI**: React frontend for starting/stopping event generation
- **Dashboard UI**: React frontend for visualizing real-time metrics
- **Data Storage**: DynamoDB for aggregations, S3 for Parquet files with lifecycle policies

## Prerequisites

- AWS Account with appropriate permissions
- Node.js 22.x
- AWS SAM CLI (`sam --version`)
- AWS CLI configured with credentials
- Bash shell

## Project Structure

```
.
├── event-generator/           # Stage 1: Event generation Lambda
│   ├── app/
│   │   └── handler.js        # Main generator logic
│   └── package.json
├── event-aggregator/          # Stages 2 & 3: Aggregation and metrics
│   ├── src/handlers/
│   │   ├── stream.js         # Kinesis stream processor
│   │   ├── metrics.js        # Metrics API endpoint
│   │   ├── ws-connect.js     # WebSocket connection handler
│   │   ├── ws-disconnect.js  # WebSocket disconnect handler
│   │   └── ws-metrics.js     # WebSocket metrics broadcaster
│   ├── src/utils/
│   │   └── parquet-writer.js # Parquet file writer
│   └── package.json
├── dashboard-frontend/        # Dashboard UI
│   └── src/
├── frontend/                  # Generator UI
│   ├── src/
│   └── .env                  # API endpoint configuration
├── template.yaml             # SAM CloudFormation template
├── deploy-generator.sh       # Deploy generator UI
└── deploy-dashboard.sh       # Deploy dashboard UI
```

## Installation & Setup

### 1. Clone and Install Dependencies

```bash
npm install
cd event-generator && npm install && cd ..
cd event-aggregator && npm install && cd ..
cd frontend && npm install && cd ..
cd dashboard-frontend && npm install && cd ..
```

### 2. Set AWS Environment Variables

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_DEFAULT_REGION=us-east-1
export AWS_CLOUDFRONT_ID=<generator-cloudfront-dist-id>  # Set after first deploy
```

### 3. Build Frontend Assets

```bash
# Generator UI
cd frontend
npm run build
cd ..

# Dashboard UI
cd dashboard-frontend
npm run build
cd ..
```

## Deployment

### First-time Deployment

```bash
# Deploy the SAM stack
sam build
sam deploy --guided

# Save the CloudFront distribution IDs from the output
# Set them as environment variables for the deploy scripts
```

### Redeploy Backend

```bash
sam build && sam deploy
```

### Deploy Generator UI

```bash
./deploy-generator.sh
```

### Deploy Dashboard UI

```bash
./deploy-dashboard.sh
```

## Usage

### Starting the Event Generator

1. Navigate to the generator CloudFront URL
2. Click the **Start Generator** button
3. Events will be generated and sent to Kinesis
4. View metrics in real-time on the dashboard

### Stopping the Event Generator

1. Click the **Stop Generator** button on the generator UI
2. Event generation ceases immediately

### Viewing Metrics

1. Navigate to the dashboard CloudFront URL
2. Metrics update in real-time via WebSocket connection
3. View aggregated event data, anomalies, and statistics

## API Endpoints

### REST API

- **POST** `/generate` - Trigger event generation (body: `{ action: "start" | "stop" }`)
- **GET** `/stream` - Get current metrics snapshot

### WebSocket API

- **wss://{api-id}.execute-api.us-east-1.amazonaws.com/prod**
  - **Action**: `getMetrics` - Subscribe to real-time metrics updates

## Data Storage

### DynamoDB Tables

- **event-stream-aggregations**: Stores aggregated metrics
  - Key: `id` (aggregation batch ID)
  - TTL: 7 days (via `expiresAt` attribute)

- **event-generator-state**: Tracks generator start/stop state
  - Key: `generatorId`

- **websocket-connections**: Maintains active WebSocket connections
  - Key: `connectionId`

### S3 Buckets

- **event-stream-raw-{account}-{region}**: Raw events in Parquet format
  - Lifecycle: Transition to Intelligent-Tiering after 30 days, delete after 90 days

- **event-stream-agg-{account}-{region}**: Aggregated data in Parquet format
  - Lifecycle: Transition to STANDARD_IA after 30 days, GLACIER after 60 days

- **my-generator-frontend-{account}**: Generator UI assets (via CloudFront)

- **my-dashboard-frontend-{account}**: Dashboard UI assets (via CloudFront)

## Monitoring

CloudWatch Logs are automatically created for all Lambda functions with 7-day retention:

- `/aws/lambda/EventGeneratorFunction`
- `/aws/lambda/AggregatorFunction`
- `/aws/lambda/MetricsFunction`
- `/aws/lambda/WebSocketConnectFunction`
- `/aws/lambda/WebSocketDisconnectFunction`
- `/aws/lambda/WebSocketMetricsFunction`

## Configuration

Edit `template.yaml` to adjust:

- **StreamShards**: Number of Kinesis shards (default: 2)
- **MemorySize**: Lambda function memory (default: 512 MB)
- **Timeout**: Lambda timeout (default: 180 seconds)
- **PriceClass**: CloudFront pricing class (default: PriceClass_100)

## Troubleshooting

### CloudFront Access Denied

If you see "Access Denied" when accessing CloudFront URLs:

1. Verify files are uploaded to S3:
   ```bash
   aws s3 ls s3://my-generator-frontend-{account-id}/ --region us-east-1
   aws s3 ls s3://my-dashboard-frontend-{account-id}/ --region us-east-1
   ```

2. Run the deployment scripts:
   ```bash
   ./deploy-generator.sh
   ./deploy-dashboard.sh
   ```

### Stack in DELETE_FAILED State

If CloudFormation stack is stuck in DELETE_FAILED:

```bash
# Check which resources failed
aws cloudformation describe-stack-events \
  --stack-name event-stream-pipeline \
  --region us-east-1 | grep DELETE_FAILED

# Manually delete blocking resources, then:
aws cloudformation delete-stack \
  --stack-name event-stream-pipeline \
  --region us-east-1
```

### WebSocket Connection Issues

- Ensure the API Gateway WebSocket stage is deployed
- Check CloudWatch logs for WebSocket Lambda functions
- Verify CORS is configured correctly on the REST API

## Cost Optimization

- DynamoDB uses on-demand billing (pay per request)
- S3 lifecycle policies transition old data to cheaper storage
- CloudFront uses PriceClass_100 (reduces number of edge locations)
- Lambda functions auto-scale based on traffic

## Security

- S3 buckets have public access blocked
- CloudFront uses Origin Access Control (OAC) with SigV4 signing
- DynamoDB and S3 encryption enabled
- Lambda functions have minimal IAM permissions
- API Gateway CORS configured

## License

MIT
