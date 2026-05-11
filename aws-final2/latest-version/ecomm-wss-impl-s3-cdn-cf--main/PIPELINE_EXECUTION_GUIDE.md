# How to Run the Pipeline: Complete Setup Guide

## 📋 Project Structure Overview

```
C:\AWS-final\                          ← ROOT DIRECTORY (sam build/deploy here)
├── template.yaml                      ← CloudFormation template (SAM reads this)
├── event-generator/
│   ├── app/
│   │   └── handler.js                ← Lambda handler (Stage 1)
│   ├── package.json
│   └── events/                        ← Sample test events
├── event-aggregator/
│   ├── src/handlers/
│   │   └── stream.js                 ← Lambda handler (Stage 2)
│   ├── package.json
│   └── __tests__/
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
└── .gitignore
```

---

## 🔧 Prerequisites (Install First)

### 1. AWS SAM CLI
```bash
# Check if already installed
sam --version

# If not installed, download from:
# https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

# Windows: Choose installer (MSI or manually)
# macOS: brew install aws-sam-cli
# Linux: pip install aws-sam-cli
```

### 2. AWS CLI
```bash
# Check if installed
aws --version

# If not: https://aws.amazon.com/cli/
```

### 3. Node.js 18.x
```bash
# Check version
node --version

# Should be 18.x or higher
# Download: https://nodejs.org/
```

### 4. Git (optional, but recommended)
```bash
git --version
```

### 5. AWS Credentials Configured
```bash
# Configure AWS credentials
aws configure

# Provide:
# AWS Access Key ID
# AWS Secret Access Key
# Default region (e.g., us-east-1, eu-west-1)
# Default output format (json)

# Verify configuration
aws sts get-caller-identity
```

---

## ✅ Step-by-Step Deployment

### Step 1: Navigate to Project Root
```bash
# Open terminal/PowerShell and navigate to root
cd C:\AWS-final

# Verify you're in the right location
# Should see: template.yaml, event-generator/, event-aggregator/, frontend/
dir
```

### Step 2: Install Dependencies (Optional but Recommended)
```bash
# From: C:\AWS-final

# Install generator dependencies
cd event-generator
npm install
cd ..

# Install aggregator dependencies
cd event-aggregator
npm install
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..

# Back to root
cd C:\AWS-final
```

### Step 3: Build the SAM Template
```bash
# Run FROM: C:\AWS-final (ROOT DIRECTORY)

sam build

# Output will create .aws-sam/ directory with built artifacts
# This takes ~1-2 minutes the first time
```

**What `sam build` does:**
- ✅ Reads `template.yaml`
- ✅ Bundles `event-generator/app/handler.js` 
- ✅ Bundles `event-aggregator/src/handlers/stream.js`
- ✅ Resolves dependencies from package.json files
- ✅ Creates `.aws-sam/build/` directory structure
- ✅ Prepares artifacts for deployment

### Step 4: Deploy to AWS
```bash
# Run FROM: C:\AWS-final (ROOT DIRECTORY)

# First deployment (interactive):
sam deploy --guided

# Subsequent deployments (faster):
sam deploy
```

#### First Deployment: Interactive Prompts
When you run `sam deploy --guided`, you'll be asked:

```
Stack Name [sam-app]: event-stream-pipeline
Region [us-east-1]: us-east-1    (or your preferred region)
Parameter StreamShards [2]: 2
Parameter EventRate [50000]: 50000
Parameter AggTableName [event-stream-aggregations]: event-stream-aggregations
Confirm changes before deploy [y/N]: y
Allow SAM CLI IAM role creation [Y/n]: Y
EventGeneratorFunction may not have authorization defined, is this OK? [y/N]: y
AggregatorFunction may not have authorization defined, is this OK? [y/N]: y
Save parameters to samconfig.toml? [Y/n]: Y
SAM configuration saved to samconfig.toml
Deploy this changeset? [y/n]: y
```

**Deployment takes 5-15 minutes for first deployment.**

#### Saved Configuration
Parameters are saved to `samconfig.toml`:
```toml
[default]
[default.deploy]
parameters = {
  "StreamShards"="2",
  "EventRate"="50000",
  "AggTableName"="event-stream-aggregations"
}
```

This means subsequent deployments only need: `sam deploy`

### Step 5: Verify Deployment
```bash
# Check stack status
aws cloudformation describe-stacks --stack-name event-stream-pipeline --query 'Stacks[0].StackStatus'

# Should return: CREATE_COMPLETE or UPDATE_COMPLETE
```

---

## 🚀 Running the Pipeline

### Method 1: Using AWS CLI (Recommended)

#### Get API Endpoint URL
```bash
# Find your API Gateway URL
aws cloudformation describe-stacks \
  --stack-name event-stream-pipeline \
  --query 'Stacks[0].Outputs[?OutputKey==`EventApiEndpoint`].OutputValue' \
  --output text
```

**Output example:**
```
https://abc123def.execute-api.us-east-1.amazonaws.com/prod/generate
```

#### Start Event Stream
```bash
# Replace <API_URL> with your URL from above

curl -X POST https://<API_URL>/generate \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start",
    "rate": 50000,
    "duration": 60,
    "attempts": 1
  }'
```

**Parameters:**
- `action`: "start" | "stop" | "health"
- `rate`: events/min (default: 50000, minimum: 50000)
- `duration`: seconds to run (default: 60)
- `attempts`: retry attempts (default: 1)

**Response:**
```json
{
  "message": "✅ Stream completed",
  "totalGenerated": 50000,
  "failedEvents": 0,
  "baseRate": 50000,
  "duration": 60,
  "temporalVariance": "0.7 - 1.3 (simulated user behavior)",
  "timestamp": "2026-04-14T10:30:00.000Z"
}
```

#### Stop Stream
```bash
curl -X POST https://<API_URL>/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "stop"}'
```

#### Health Check
```bash
curl -X POST https://<API_URL>/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "health"}'

# Response:
# {
#   "status": "✅ OK",
#   "streamingActive": false,
#   "minimumRate": 50000,
#   "temporalVariance": "0.7 - 1.3"
# }
```

### Method 2: Using AWS Console (GUI)

1. Go to **API Gateway** console
2. Find **event-stream-api**
3. Click on **Stages** → **prod**
4. Copy **Invoke URL**
5. Use in curl or Postman

### Method 3: Using Admin Panel (When Frontend Ready)

```bash
# Build frontend
cd C:\AWS-final\frontend
npm run build

# Output in frontend/dist/
# Deploy frontend separately or configure CloudFront
```

---

## 📊 Monitoring the Pipeline

### View Real-Time Logs

#### Event Generator Logs
```bash
# Watch generator Lambda logs in real-time
aws logs tail /aws/lambda/EventGeneratorFunction --follow

# Example output:
# 🚀 Starting stream: 50000/min for 60s with temporal variance (0.7-1.3)
# 📤 Sec 0: Base 50000/min, Temporal ~1.15, Generating 958 events
# 📤 Sec 1: Base 50000/min, Temporal ~0.98, Generating 813 events
# ✅ Streamed 500 events to Kinesis
```

#### Event Aggregator Logs
```bash
# Watch aggregator Lambda logs
aws logs tail /aws/lambda/AggregatorFunction --follow

# Example output:
# Processing 100 records from Kinesis
# Aggregations updated for minute: 2026-04-14T10:30
# Stored in DynamoDB: 20 aggregation records
```

### View Metrics in CloudWatch

```bash
# Lambda metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=EventGeneratorFunction \
  --start-time 2026-04-14T00:00:00Z \
  --end-time 2026-04-14T23:59:59Z \
  --period 3600 \
  --statistics Sum

# Kinesis metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Kinesis \
  --metric-name GetRecords.IteratorAgeMilliseconds \
  --dimensions Name=StreamName,Value=event-stream-pipeline \
  --start-time 2026-04-14T00:00:00Z \
  --end-time 2026-04-14T23:59:59Z \
  --period 3600 \
  --statistics Average
```

### View DynamoDB Data

```bash
# Scan aggregations table
aws dynamodb scan \
  --table-name event-stream-aggregations \
  --limit 10

# Query by timestamp
aws dynamodb query \
  --table-name event-stream-aggregations \
  --key-condition-expression "id = :id" \
  --expression-attribute-values '{":id":{"S":"minute#2026-04-14T10:30"}}'
```

---

## 🔄 Pipeline Data Flow

```
┌─────────────────────────────────┐
│  API Gateway: POST /generate    │
│  (Triggered by curl/frontend)   │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│   Event Generator Lambda         │
│   (event-generator/app)          │
│   • Generates 50,000/min events  │
│   • Applies 0.7-1.3 variance     │
│   • Outputs to Kinesis           │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│   Kinesis Stream                 │
│   (event-stream-pipeline)        │
│   • 2 shards capacity: 2K/sec    │
│   • Buffers events for aggregator│
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│   Event Aggregator Lambda        │
│   (event-aggregator/src)         │
│   • Processes 100 records/batch  │
│   • Multi-dimensional aggregation│
│   • Outputs to DynamoDB          │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│   DynamoDB Table                 │
│   (event-stream-aggregations)    │
│   • Real-time analytics data     │
│   • TTL: Clean old records       │
│   • PITR: Point-in-time recovery │
└─────────────────────────────────┘
```

---

## 🛠️ Troubleshooting

### Issue: `sam: command not found`
```bash
# Solution: Install AWS SAM CLI
# https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

# Or add to PATH if installed
echo $PATH  # macOS/Linux
echo %PATH%  # Windows PowerShell
```

### Issue: `template.yaml not found`
```bash
# Make sure you're in C:\AWS-final (ROOT directory)
pwd          # macOS/Linux
Get-Location # Windows PowerShell

# List files
ls           # macOS/Linux
dir          # Windows
```

### Issue: `AWS credentials not configured`
```bash
# Run:
aws configure

# Or set environment variables:
# Windows PowerShell:
$env:AWS_ACCESS_KEY_ID = "your-key"
$env:AWS_SECRET_ACCESS_KEY = "your-secret"
$env:AWS_DEFAULT_REGION = "us-east-1"

# macOS/Linux:
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=us-east-1
```

### Issue: Deployment fails with permission error
```bash
# Make sure your AWS user has these permissions:
# - CloudFormation full access
# - Lambda full access
# - Kinesis full access
# - DynamoDB full access
# - APIGateway full access
# - IAM role creation (for SAM)

# Test permissions:
aws iam list-attached-user-policies --user-name <your-username>
```

### Issue: Events not reaching DynamoDB
```bash
# Check Kinesis stream status
aws kinesis describe-stream --stream-name event-stream-pipeline

# Check Lambda function errors
aws logs tail /aws/lambda/AggregatorFunction --follow

# Check DynamoDB table
aws dynamodb describe-table --table-name event-stream-aggregations
```

---

## 📈 Performance Tuning

### Increase Shards for Higher Throughput
```bash
# Update shards (currently 2)
sam deploy \
  --parameter-overrides StreamShards=4 EventRate=100000

# Each shard: 1,000 records/sec
# 4 shards: 4,000 records/sec capacity
```

### Adjust Lambda Memory
Edit `template.yaml`:
```yaml
Globals:
  Function:
    MemorySize: 1024  # Increase from 512
    Timeout: 300      # Increase from 180
```

Then redeploy:
```bash
sam build
sam deploy
```

### Batch Configuration
Edit `template.yaml` in AggregatorFunction:
```yaml
Properties:
  Events:
    KinesisStream:
      Properties:
        BatchSize: 200          # Increase from 100
        MaximumBatchingWindowInSeconds: 10  # Increase from 5
```

---

## 🧹 Cleanup

### Delete Everything (Costs)
```bash
# Delete CloudFormation stack (deletes all AWS resources)
aws cloudformation delete-stack --stack-name event-stream-pipeline

# Verify deletion
aws cloudformation describe-stacks --stack-name event-stream-pipeline
# Should error: "does not exist"
```

### Save samconfig.toml (for later)
```bash
# Keep samconfig.toml to redeploy with same settings
# Location: C:\AWS-final\samconfig.toml
```

---

## 📝 Quick Reference Commands

| Command | Location | Purpose |
|---------|----------|---------|
| `sam build` | `C:\AWS-final` | Build SAM template |
| `sam deploy --guided` | `C:\AWS-final` | First deployment (interactive) |
| `sam deploy` | `C:\AWS-final` | Subsequent deployments |
| `npm install` | `event-generator/` or `event-aggregator/` | Install dependencies |
| `npm run test` | `event-aggregator/` | Run tests |
| `curl -X POST <URL>/generate` | Any terminal | Start stream |
| `aws logs tail /aws/lambda/*` | Any terminal | View Lambda logs |
| `aws cloudformation delete-stack` | Any terminal | Delete stack |

---

## ✨ Summary

**Deployment Hierarchy:**
```
1. Prerequisites Check ✅ (Node.js, AWS CLI, SAM CLI, AWS credentials)
   ↓
2. Root Directory: C:\AWS-final
   ↓
3. sam build           (builds artifacts)
   ↓
4. sam deploy --guided (first time) or sam deploy (subsequent)
   ↓
5. Get API URL from stack outputs
   ↓
6. curl to start/stop/health check
   ↓
7. Monitor with aws logs tail & CloudWatch
```

**Everything runs from:** `C:\AWS-final` (the root)
**Configuration saved in:** `samconfig.toml`
**Always check location before running sam commands:** Use `pwd` (macOS/Linux) or `Get-Location` (PowerShell)
