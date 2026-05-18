# Frontend & Dashboard Integration Architecture

## 📊 Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION LAYER                              │
│                                                                             │
│  ┌──────────────────────────────────────┐                                  │
│  │  React Frontend (Vite)               │                                  │
│  │  ├─ Dashboard UI                     │                                  │
│  │  ├─ Control Panel (Start/Stop)       │                                  │
│  │  ├─ Real-time Metrics Display        │                                  │
│  │  ├─ Event Stream Visualization       │                                  │
│  │  └─ Anomaly Detection Monitor        │                                  │
│  └──────────────────┬───────────────────┘                                  │
│                     │                                                       │
│                     │ HTTP/HTTPS API Calls                                 │
│                     ▼                                                       │
└─────────────────────┼─────────────────────────────────────────────────────┘
                      │
                      │
┌─────────────────────┼─────────────────────────────────────────────────────┐
│                     │        API GATEWAY LAYER (AWS)                       │
│  ┌──────────────────▼───────────────────┐                                  │
│  │  API Gateway: event-stream-api       │                                  │
│  │  ├─ POST /prod/generate              │  ◄── Frontend calls this         │
│  │  │   • action: "start", "stop", etc  │                                  │
│  │  │   • Parameters: rate, duration    │                                  │
│  │  │                                   │                                  │
│  │  └─ Triggers Lambda                  │                                  │
│  └──────────────────┬───────────────────┘                                  │
│                     │                                                       │
└─────────────────────┼─────────────────────────────────────────────────────┘
                      │
                      │ Lambda Invocation (synchronous)
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STAGE 1: EVENT GENERATION                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Lambda: EventGeneratorFunction                                      │   │
│  │  (event-generator/app/handler.js)                                    │   │
│  │                                                                      │   │
│  │  INPUT from Frontend:                                               │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │ {                                                              │ │   │
│  │  │   "action": "start",                                           │ │   │
│  │  │   "rate": 50000,              ◄─ Events per minute             │ │   │
│  │  │   "duration": 60,             ◄─ How long to run (seconds)     │ │   │
│  │  │   "attempts": 1               ◄─ Retry attempts                │ │   │
│  │  │ }                                                              │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                      │   │
│  │  PROCESSING:                                                        │   │
│  │  • Generates synthetic events (50K+/min)                           │   │
│  │  • Applies temporal variance (0.7-1.3 multiplier)                 │   │
│  │  • Per-second recalculation of event count                         │   │
│  │  • Simulates real user behavior patterns                           │   │
│  │  • Detects anomalies (bot activity, fraud, etc)                   │   │
│  │                                                                      │   │
│  │  OUTPUT: Events streamed to Kinesis                               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  RESPONSE to Frontend:                                                  │
│  ┌────────────────────────────────────────────────────────────────────┐ │   │
│  │ {                                                                  │ │   │
│  │   "statusCode": 200,                                              │ │   │
│  │   "body": {                                                        │ │   │
│  │     "message": "✅ Stream completed",                              │ │   │
│  │     "totalGenerated": 50000,   ◄─ Total events created           │ │   │
│  │     "failedEvents": 0,         ◄─ Errors during streaming         │ │   │
│  │     "baseRate": 50000,         ◄─ Rate requested                  │ │   │
│  │     "duration": 60,                                               │ │   │
│  │     "temporalVariance": "0.7 - 1.3",                              │ │   │
│  │     "timestamp": "2026-04-14T10:30:00.000Z"                       │ │   │
│  │   }                                                                │ │   │
│  │ }                                                                  │ │   │
│  └────────────────────────────────────────────────────────────────────┘ │   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                      │
                      │ Kinesis PutRecords (batched)
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATA STREAMING LAYER (AWS Kinesis)                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Kinesis Stream: event-stream-pipeline                              │   │
│  │  ├─ Shards: 2 (configurable)                                        │   │
│  │  ├─ Capacity: 2,000 records/sec                                     │   │
│  │  ├─ Partition Key: ${category}-${randomKey}                         │   │
│  │  ├─ Batch Size: 500 records max per put                             │   │
│  │  └─ Retention: 24 hours (default)                                   │   │
│  │                                                                      │   │
│  │  EVENTS IN STREAM:                                                  │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │ {                                                              │ │   │
│  │  │   "eventId": "uuid",                                           │ │   │
│  │  │   "userId": "user-12345",                                      │ │   │
│  │  │   "eventType": "page_view|product_view|add_to_cart|order",    │ │   │
│  │  │   "productCategory": "electronics|fashion|...",               │ │   │
│  │  │   "timestamp": "2026-04-14T10:30:15.123Z",                   │ │   │
│  │  │   "segment": "student|working_professional|...",              │ │   │
│  │  │   "deviceType": "mobile|desktop|tablet|smartwatch",           │ │   │
│  │  │   "city": "Bengaluru|Mumbai|...",                             │ │   │
│  │  │   "orderValue": 1500,                                          │ │   │
│  │  │   "isAnomaly": true,                                           │ │   │
│  │  │   "anomalyType": "bot_activity|fraud_attempt|...",            │ │   │
│  │  │   "campaignId": "cmp_flash_deal",                              │ │   │
│  │  │   ... (15+ more fields)                                        │ │   │
│  │  │ }                                                              │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                      │
                      │ Kinesis Event Source Mapping (async)
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STAGE 2: EVENT AGGREGATION                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Lambda: AggregatorFunction                                          │   │
│  │  (event-aggregator/src/handlers/stream.js)                           │   │
│  │                                                                      │   │
│  │  TRIGGERED BY:                                                      │   │
│  │  • Kinesis event source mapping                                     │   │
│  │  • Batch size: 100 records                                          │   │
│  │  • Max batching window: 5 seconds                                   │   │
│  │  • Parallel factor: 1 (sequential)                                  │   │
│  │                                                                      │   │
│  │  PROCESSING:                                                        │   │
│  │  • Single-pass aggregation of 100 events                            │   │
│  │  • Multi-dimensional aggregation:                                   │   │
│  │     - Timeline (by minute)                                          │   │
│  │     - Category breakdown                                            │   │
│  │     - Campaign performance                                          │   │
│  │     - Device type distribution                                      │   │
│  │     - User segment analysis                                         │   │
│  │     - Geographic distribution                                       │   │
│  │     - Anomaly tracking                                              │   │
│  │  • Publishes anomalies to SNS                                       │   │
│  │                                                                      │   │
│  │  OUTPUT: Aggregated metrics to DynamoDB                             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                      │
                      │ DynamoDB UpdateItem/PutItem
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DATA STORAGE LAYER (AWS DynamoDB)                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  DynamoDB Table: event-stream-aggregations                           │   │
│  │  ├─ Billing: PAY_PER_REQUEST (auto-scaling)                          │   │
│  │  ├─ TTL: Enabled (auto-cleanup after retention)                      │   │
│  │  ├─ PITR: Point-in-time recovery enabled                             │   │
│  │  ├─ Streams: NEW_AND_OLD_IMAGES for auditing                         │   │
│  │  └─ Schema:                                                           │   │
│  │     • id (Primary Key): Unique aggregation identifier                │   │
│  │     • data: Multi-dimensional aggregations                           │   │
│  │     • timestamp: When aggregation was computed                       │   │
│  │     • expiresAt: TTL field for auto-deletion                         │   │
│  │                                                                      │   │
│  │  AGGREGATION DATA STRUCTURE:                                        │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │ {                                                              │ │   │
│  │  │   "id": "minute#2026-04-14T10:30",                             │ │   │
│  │  │   "countsByMinute": {                                          │ │   │
│  │  │     "2026-04-14T10:30": {                                      │ │   │
│  │  │       "total": 50000,                                          │ │   │
│  │  │       "orders": 2500,                                          │ │   │
│  │  │       "revenue": 3750000,                                      │ │   │
│  │  │       "page_view": 22500,                                      │ │   │
│  │  │       "product_view": 15000,                                   │ │   │
│  │  │       "add_to_cart": 9000,                                     │ │   │
│  │  │       "wishlist_add": 1000                                     │ │   │
│  │  │     }                                                          │ │   │
│  │  │   },                                                           │ │   │
│  │  │   "categoryAgg": {                                             │ │   │
│  │  │     "cat#electronics": { "total": 5000, ... },                │ │   │
│  │  │     "cat#fashion": { "total": 11000, ... },                   │ │   │
│  │  │     ...                                                        │ │   │
│  │  │   },                                                           │ │   │
│  │  │   "campaignAgg": { ... },                                     │ │   │
│  │  │   "deviceAgg": { ... },                                       │ │   │
│  │  │   "segmentAgg": { ... },                                      │ │   │
│  │  │   "cityAgg": { ... },                                         │ │   │
│  │  │   "anomalies": [                                              │ │   │
│  │  │     { "type": "bot_activity", "count": 5 },                   │ │   │
│  │  │     { "type": "fraud_attempt", "count": 2 },                  │ │   │
│  │  │     ...                                                        │ │   │
│  │  │   ]                                                            │ │   │
│  │  │ }                                                              │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                      │
                      │ Dashboard queries data periodically
                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FRONTEND DASHBOARD (for visualization)                   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Dashboard Components (to be implemented):                           │   │
│  │  ├─ Control Panel                                                    │   │
│  │  │  ├─ Start/Stop buttons                                           │   │
│  │  │  ├─ Rate slider (50K - 500K+)                                    │   │
│  │  │  ├─ Duration input                                               │   │
│  │  │  └─ Submit button                                                │   │
│  │  │                                                                  │   │
│  │  ├─ Real-time Metrics Display                                       │   │
│  │  │  ├─ Total events generated                                       │   │
│  │  │  ├─ Events per second (live)                                     │   │
│  │  │  ├─ Temporal variance indicator (0.7-1.3)                        │   │
│  │  │  ├─ Failed events count                                          │   │
│  │  │  └─ Stream status                                                │   │
│  │  │                                                                  │   │
│  │  ├─ Time Series Charts                                              │   │
│  │  │  ├─ Events over time                                             │   │
│  │  │  ├─ Revenue by minute                                            │   │
│  │  │  ├─ Order count trend                                            │   │
│  │  │  └─ Conversion rate                                              │   │
│  │  │                                                                  │   │
│  │  ├─ Category Breakdown                                              │   │
│  │  │  ├─ Events by category                                           │   │
│  │  │  ├─ Revenue by category                                          │   │
│  │  │  ├─ Orders by category                                           │   │
│  │  │  └─ Conversion by category                                       │   │
│  │  │                                                                  │   │
│  │  ├─ Campaign Performance                                            │   │
│  │  │  ├─ Events per campaign                                          │   │
│  │  │  ├─ Campaign ROI                                                 │   │
│  │  │  └─ Conversion by campaign                                       │   │
│  │  │                                                                  │   │
│  │  ├─ Device & Segment Analysis                                       │   │
│  │  │  ├─ Mobile vs Desktop vs Tablet                                  │   │
│  │  │  ├─ Segment distribution                                         │   │
│  │  │  └─ Age group metrics                                            │   │
│  │  │                                                                  │   │
│  │  ├─ Geographic Distribution                                         │   │
│  │  │  ├─ Events by city                                               │   │
│  │  │  ├─ Revenue by region                                            │   │
│  │  │  └─ Top performing cities                                        │   │
│  │  │                                                                  │   │
│  │  └─ Anomaly Detection Monitor                                       │   │
│  │     ├─ Anomaly count                                                │   │
│  │     ├─ Anomaly type breakdown                                       │   │
│  │     │  ├─ Bot activity                                              │   │
│  │     │  ├─ Fraud attempts                                            │   │
│  │     │  ├─ Bulk purchases                                            │   │
│  │     │  └─ Traffic spikes                                            │   │
│  │     └─ Anomaly timeline                                             │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow: How Everything is Connected

### Step 1: User Triggers Stream via Frontend
```
Frontend Dashboard
     │
     │ User clicks "Start Stream"
     │
     ▼
Form filled:
  • rate: 50000 (or custom value)
  • duration: 60 (seconds)
  • attempts: 1
     │
     ▼
JavaScript fetch() call
  POST https://<api-endpoint>/prod/generate
```

### Step 2: HTTP Request Routes to Lambda
```
Frontend HTTP Request
     │
     ├─ Method: POST
     ├─ Path: /prod/generate
     ├─ Headers: Content-Type: application/json
     └─ Body: { "action": "start", "rate": 50000, ... }
     │
     ▼
API Gateway (event-stream-api)
  • Route: /generate
  • Method: POST
  • Stage: prod
     │
     ▼
Forwards to Lambda
```

### Step 3: Lambda Processes Request
```
EventGeneratorFunction (event-generator/app/handler.js)
     │
     ├─ exports.handler(event) called
     ├─ Parses event body
     ├─ Extracts: action, rate, duration, attempts
     │
     ▼
FOR each second in duration:
  1. Calculate temporal multiplier (0.7-1.3)
  2. Adjust rate: baseRate / 60 * multiplier
  3. Generate N events
  4. Send to Kinesis in batches of 500
     │
     ▼
Return response to Frontend
```

### Step 4: Events Stream Through Pipeline
```
Lambda → Kinesis Stream → Lambda Aggregator → DynamoDB
```

### Step 5: Frontend Displays Results
```
Response from API Gateway
     │
     ├─ statusCode: 200
     ├─ body: {
     │    totalGenerated: 50000,
     │    failedEvents: 0,
     │    baseRate: 50000,
     │    temporalVariance: "0.7 - 1.3",
     │    timestamp: "..."
     │  }
     │
     ▼
Frontend App.jsx processes response
     │
     ├─ Update state: totalGenerated
     ├─ Update state: failedEvents
     ├─ Display success toast
     │
     ▼
Dashboard shows metrics
```

---

## 💻 Frontend Implementation: How to Call the Lambda

### Current Frontend Setup (App.jsx)

```javascript
// Environment variable configuration
const API_ENDPOINT = import.meta.env.VITE_API_BASE_URL;
// Example: https://abc123def.execute-api.us-east-1.amazonaws.com/prod

// Generic API call function
const callAPI = async (endpoint, body = {}) => {
  try {
    const res = await fetch(`${API_ENDPOINT}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (err) {
    console.error("API error:", err);
  }
};

// Start stream function (called when user clicks "Start")
const startStream = async () => {
  setStatus("running");
  
  // Call the Lambda via API Gateway
  const response = await callAPI("/generate", {
    action: "start",
    rate: 50000,           // events per minute
    duration: 60,          // seconds
    attempts: 1
  });
  
  console.log("Response:", response);
  // response contains: totalGenerated, failedEvents, etc.
  
  showToast("Stream started - generating events every 5 seconds", false);
};

// Stop stream function
const stopStream = async () => {
  const response = await callAPI("/generate", {
    action: "stop"
  });
  
  setStatus("stopped");
  showToast("Stream stopped", false);
};

// Health check
const checkHealth = async () => {
  const response = await callAPI("/generate", {
    action: "health"
  });
  
  console.log("Status:", response.status);
  console.log("Streaming active:", response.streamingActive);
};
```

### Environment Variable Setup

Create `.env` file in `frontend/` directory:

```bash
# frontend/.env
VITE_API_BASE_URL=https://abc123def.execute-api.us-east-1.amazonaws.com/prod
```

Or set via environment:
```bash
export VITE_API_BASE_URL=https://...
npm run dev
```

---

## 🎯 What Happens When You Click "Start Stream"

```
┌─ User clicks "Start Stream" button ─┐
│                                     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─ React Handler: startStream() ───────┐
│  • Sets status to "running"           │
│  • Shows loading toast                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─ callAPI("/generate", {...}) ───────┐
│  • Prepares JSON body:               │
│    {                                 │
│      "action": "start",              │
│      "rate": 50000,                  │
│      "duration": 60,                 │
│      "attempts": 1                   │
│    }                                 │
│  • Sends POST request                │
└──────────────┬──────────────────────┘
               │ HTTP POST
               ▼
┌─ API Gateway receives request ───────┐
│  • Path: /prod/generate              │
│  • Method: POST                      │
│  • Validates CORS                    │
└──────────────┬──────────────────────┘
               │ Invokes Lambda
               ▼
┌─ EventGeneratorFunction executes ───┐
│  • Parses event body                 │
│  • Extracts: rate=50000, duration=60 │
│  • Generates ~50,000 events/minute   │
│  • Sends to Kinesis stream           │
│  • Returns response                  │
└──────────────┬──────────────────────┘
               │ HTTP 200 + JSON
               ▼
┌─ Frontend receives response ────────┐
│  • totalGenerated: 50000            │
│  • failedEvents: 0                  │
│  • Shows success toast               │
│  • Updates dashboard metrics        │
└────────────────────────────────────┘
```

---

## 🔌 Frontend-Backend Connection Points

| Component | Call | Endpoint | Purpose |
|-----------|------|----------|---------|
| **Start Stream Button** | `POST /generate` | `/prod/generate` | Trigger event generation |
| **Stop Stream Button** | `POST /generate` | `/prod/generate` | Stop stream |
| **Health Check** | `POST /generate` | `/prod/generate` | Check status |
| **Metrics Display** | Query DynamoDB (optional) | N/A | Fetch aggregations |
| **Real-time Updates** | WebSocket (optional) | N/A | Push real-time metrics |

---

## 📋 How to Set Up Frontend Environment

### Step 1: Get API Endpoint from Deployment
```bash
# After deploying with SAM
aws cloudformation describe-stacks \
  --stack-name event-stream-pipeline \
  --query 'Stacks[0].Outputs[?OutputKey==`EventApiEndpoint`].OutputValue' \
  --output text

# Output example:
# https://abc123def.execute-api.us-east-1.amazonaws.com/prod
```

### Step 2: Configure Frontend
```bash
cd frontend

# Create .env file
cat > .env << EOF
VITE_API_BASE_URL=https://abc123def.execute-api.us-east-1.amazonaws.com/prod
EOF

# Or use environment variable
export VITE_API_BASE_URL=https://abc123def.execute-api.us-east-1.amazonaws.com/prod
```

### Step 3: Run Developer Server
```bash
npm run dev

# Output:
# VITE v8.0.1  ready in 234 ms
# 
# ➜  Local:   http://localhost:5173/
# ➜  press h to show help
```

### Step 4: Build for Production
```bash
npm run build

# Output files go to frontend/dist/
# Deploy to CloudFront or S3 static hosting
```

---

## 🔐 CORS Configuration

The API Gateway is already configured for CORS:

```yaml
EventApi:
  Type: AWS::Serverless::Api
  Properties:
    Cors:
      AllowMethods: "'GET, POST, OPTIONS'"
      AllowHeaders: "'Content-Type, Authorization'"
      AllowOrigin: "'*'"           # Allow from any origin in dev
```

In production, change to specific origin:
```yaml
AllowOrigin: "'https://your-domain.com'"
```

---

## 🎨 Dashboard Features to Build

### 1. Control Panel
```jsx
<div className="control-panel">
  <button onClick={startStream} disabled={status === "running"}>
    Start Stream
  </button>
  <button onClick={stopStream} disabled={status === "stopped"}>
    Stop Stream
  </button>
  <input type="number" value={rate} onChange={setRate} min={50000} />
  <input type="number" value={duration} onChange={setDuration} />
</div>
```

### 2. Metrics Display
```jsx
<div className="metrics">
  <Card title="Total Events" value={totalGenerated} />
  <Card title="Failed Events" value={failedEvents} />
  <Card title="Events/Sec" value={eventsPerSec} />
  <Card title="Temporal Variance" value="0.7-1.3" />
  <Card title="Status" value={status} />
</div>
```

### 3. Real-time Data Visualization
```jsx
<LineChart
  data={timeSeriesData}
  title="Events Over Time"
  xAxis="timestamp"
  yAxis="count"
/>

<BarChart
  data={categoryData}
  title="Events by Category"
/>

<PieChart
  data={segmentData}
  title="User Segments"
/>
```

### 4. Anomaly Monitoring
```jsx
<AnomalyTable
  anomalies={anomalies}
  columns={["type", "count", "timestamp"]}
/>
```

---

## 🚀 Complete Request/Response Cycle

### Request Example
```bash
curl -X POST https://abc123def.execute-api.us-east-1.amazonaws.com/prod/generate \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start",
    "rate": 50000,
    "duration": 60,
    "attempts": 1
  }'
```

### Response Example
```json
{
  "statusCode": 200,
  "body": {
    "message": "✅ Stream completed",
    "totalGenerated": 50000,
    "failedEvents": 0,
    "baseRate": 50000,
    "duration": 60,
    "temporalVariance": "0.7 - 1.3 (simulated user behavior)",
    "timestamp": "2026-04-14T10:30:00.000Z"
  }
}
```

### Frontend Processing
```javascript
async function startStream() {
  try {
    const response = await callAPI("/generate", {
      action: "start",
      rate: 50000,
      duration: 60,
      attempts: 1
    });
    
    // Update dashboard state
    setTotalGenerated(response.body.totalGenerated);
    setFailedEvents(response.body.failedEvents);
    setStatus("completed");
    
    // Show success notification
    showToast(`Generated ${response.body.totalGenerated} events!`);
    
  } catch (error) {
    console.error("Failed to start stream:", error);
    showToast("Error starting stream", true);
  }
}
```

---

## 🔗 Summary: How It All Connects

```
Frontend (React)
    |
    | User clicks "Start"
    |
    ▼
API Gateway (/generate)
    |
    | Routes to Lambda
    |
    ▼
Event Generator Lambda
    |
    | Generates 50K+/min events
    |
    ▼
Kinesis Stream
    |
    | Batches events
    |
    ▼
Event Aggregator Lambda
    |
    | Aggregates dimensions
    |
    ▼
DynamoDB
    |
    | Stores metrics
    |
    ▼
Frontend Dashboard (queries via optional API)
    |
    | Displays metrics
```

**Key Connection Points:**
- ✅ Frontend → API Gateway (HTTP)
- ✅ API Gateway → Lambda Generator (sync invocation)
- ✅ Lambda → Kinesis (async PutRecords)
- ✅ Kinesis → Lambda Aggregator (async event source mapping)
- ✅ Lambda → DynamoDB (async writes)
- ✅ Frontend ← Dashboard (optional polling/websockets)

All connected and working together! 🎯
