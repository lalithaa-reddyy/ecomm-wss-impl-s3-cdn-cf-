# Dashboard Integration - Deployment Checklist

## Overview
✅ New dashboard code integrated with recharts
✅ MetricsFunction Lambda created to query DynamoDB
✅ API Gateway endpoint configured (/stream)
✅ Frontend environment variables set up

## Pre-Deployment Verification

### 1. Verify Files Created/Updated
```powershell
cd c:\AWS-final

# Check dashboard code
Test-Path frontend\src\App.jsx  # Should show True
Test-Path frontend\src\App.jsx.backup  # Old version backed up

# Check metrics Lambda
Test-Path event-aggregator\src\handlers\metrics.mjs  # Should show True

# Verify environments
Get-Content frontend\.env  # Should have VITE_API_ENDPOINT
```

### 2. Check template.yaml
Verify these sections exist:
- `MetricsFunction`: Lambda definition with /stream endpoint ✅
- `MetricsApiEndpoint`: Output for dashboard URL ✅
- `MetricsLogGroup`: CloudWatch logs for debugging ✅

## Deployment Steps

### Step 1: Install Frontend Dependencies
```powershell
cd c:\AWS-final\frontend
npm install  # Will install recharts ^2.10.0
```

### Step 2: Build SAM Application
```powershell
cd c:\AWS-final
sam build
```
Expected output: `Build Succeeded`

### Step 3: Deploy to AWS
```powershell
sam deploy  # Use previous configuration (just press Enter)
```

**Important**: Note the outputs from deployment:
- `MetricsApiEndpoint`: https://xxxxx.execute-api.region.amazonaws.com/prod/stream
- `GeneratorApiEndpoint`: https://xxxxx.execute-api.region.amazonaws.com/prod/generate

### Step 4: Update Frontend Endpoint (if needed)
If the `MetricsApiEndpoint` changed, update `frontend/.env`:
```
VITE_API_ENDPOINT=https://your-new-endpoint.execute-api.region.amazonaws.com/prod
```

### Step 5: Start Event Stream
```powershell
# Terminal 1: Build frontend
cd c:\AWS-final\frontend
npm run build

# Terminal 2: Start dev server (if testing locally)
cd c:\AWS-final\frontend
npm run dev  # Will serve at http://localhost:5173
```

### Step 6: Generate Events
```powershell
# Terminal 3: Trigger event generation
$url = "https://your-api-endpoint.execute-api.region.amazonaws.com/prod/generate"
$body = @{
    rate = 50000
    durationSeconds = 300
    includeAnomalies = $true
} | ConvertTo-Json

Invoke-WebRequest -Uri $url -Method POST -Body $body -ContentType "application/json"
```

## Testing Checklist

- [ ] Event stream generates events (check CloudWatch logs)
- [ ] Dashboard loads at http://localhost:5173
- [ ] "LIVE" indicator shows green (events flowing)
- [ ] Metrics update every 3 seconds
- [ ] Tab navigation works (Overview, Campaigns, Geography, Age Groups, Revenue)
- [ ] Charts render with data
- [ ] No "CONNECTING" message
- [ ] No HTTP errors in console

## Troubleshooting

### Dashboard shows "Connecting to dashboard..."
**Issue**: Api endpoint not reachable
**Fix**: 
1. Verify VITE_API_ENDPOINT in frontend/.env
2. Check CloudFormation outputs for correct endpoint
3. Verify API Gateway /stream endpoint exists: `aws apigateway get-rest-apis --query 'items[?name==`event-stream-api`]'`

### "ERROR: HTTP 404"
**Issue**: MetricsFunction endpoint missing or route not registered
**Fix**:
1. Verify metrics.mjs exists: `aws lambda list-functions --query 'Functions[?FunctionName==`event-stream-pipeline-MetricsFunction*`]'`
2. Check API Gateway routes: `aws apigateway get-resources --rest-api-id <api-id>`
3. Should see `/stream` resource

### "No data yet" message
**Issue**: Events not flowing to DynamoDB
**Fix**:
1. Trigger event generation (see Step 6 above)
2. Check if events are in DynamoDB: `aws dynamodb scan --table-name event-stream-aggregations --max-items 5`
3. Verify Kinesis stream has records: `aws kinesis describe-stream --stream-name event-stream-pipeline`
4. Check Lambda logs: `aws logs tail /aws/lambda/event-stream-pipeline-AggregatorFunction -f`

### Charts not rendering
**Issue**: Recharts library not installed
**Fix**:
```powershell
cd c:\AWS-final\frontend
npm install recharts --save
npm run dev  # Rebuild
```

### Metrics Lambda timing out
**Issue**: DynamoDB scan taking too long
**Fix**:
1. Metrics function timeout is 15s (should be enough)
2. Check if DynamoDB has excessive data (consider using TTL)
3. Verify read capacity (using ON_DEMAND)

## Data Flow Architecture

```
1. User clicks "Overview" tab
   ↓
2. Frontend calls fetch(`${API_ENDPOINT}/stream`)
   ↓
3. API Gateway routes to MetricsFunction Lambda
   ↓
4. MetricsFunction queries DynamoDB (event-stream-aggregations table)
   ↓
5. Returns aggregated metrics in JSON format:
   {
     "totalEvents": 1250000,
     "eventsByType": { "page_view": 562500, ... },
     "categoryStats": { "electronics": { "total": 250000, ... }, ... },
     "campaignStats": { "cmp_flash_deal": { ... }, ... },
     "geoStats": { "Bengaluru": { ... }, ... },
     "ageStats": { "26-35": { ... }, ... },
     "revenueStats": { "total_revenue": 25000000, ... },
     "recentMinutes": [ { id: "agg#2026-04-13#14#30", ... }, ... ]
   }
   ↓
6. Dashboard renders 5 tabs with recharts visualizations
   ↓
7. Auto-refreshes every 3 seconds
```

## API Endpoint Details

### POST /generate
Triggers event generation to Kinesis stream

**Request**:
```json
{
  "rate": 50000,
  "durationSeconds": 300,
  "includeAnomalies": true
}
```

**Response**:
```json
{
  "message": "Event generation started",
  "eventsGenerated": 2500,
  "estimatedDuration": 300
}
```

### GET /stream
Returns aggregated metrics from DynamoDB

**Response**: (See Data Flow Architecture above)

## Deployment Success Indicators

✅ `sam deploy` completes without errors
✅ MetricsApiEndpoint appears in CloudFormation outputs  
✅ Dashboard loads and shows "LIVE" status
✅ Charts populate with data from DynamoDB
✅ All 5 tabs render correctly
✅ Auto-refresh works (countdown timer visible)
✅ No console errors or network errors

## Next Steps

1. **Monitoring**: Set up CloudWatch dashboards for Lambda performance
2. **Scaling**: Adjust Kinesis shards if needed (currently 2 shards)
3. **Data Retention**: Configure DynamoDB TTL to manage table size
4. **Alerting**: Enable SNS notifications for anomalies
5. **Frontend Hosting**: Deploy frontend to S3 + CloudFront for production

## Quick Commands Reference

```powershell
# Deploy everything
sam build; sam deploy

# Get endpoints
aws cloudformation describe-stacks --stack-name event-stream-pipeline --query 'Stacks[0].Outputs' --output table

# Trigger event generation
Invoke-WebRequest -Uri "https://api-endpoint/generate" -Method POST -Body '{"rate":50000}' -ContentType "application/json"

# Check Lambda logs (tail last 20 lines)
aws logs tail /aws/lambda/event-stream-pipeline-MetricsFunction --max-items 20

# Scan DynamoDB for recent aggregations
aws dynamodb query --table-name event-stream-aggregations --key-condition-expression "begins_with(id, :prefix)" --expression-attribute-values '{":prefix":{\"S":"agg#"}}'

# Frontend build
cd frontend; npm install; npm run build
```

## Support

For issues during deployment:
1. Check CloudFormation events: `aws cloudformation describe-stack-events --stack-name event-stream-pipeline`
2. View Lambda logs: `aws logs tail /aws/lambda/<function-name> -f`
3. Verify template syntax: `sam validate`
4. Check VPC/networking if endpoint unreachable
