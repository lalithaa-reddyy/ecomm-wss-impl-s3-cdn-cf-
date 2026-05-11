# Parquet Format Implementation for S3

## Overview

The event stream pipeline now supports writing aggregated event data to Amazon S3 in **Apache Parquet** format, providing efficient columnar storage for analytics and data science workloads.

## What is Parquet?

[Apache Parquet](https://parquet.apache.org/) is a columnar storage file format that:
- **Reduces storage size** by up to 80% compared to JSON
- **Improves query performance** via columnar compression
- **Enables efficient analytics** with tools like AWS Athena, QuickSight, and Redshift Spectrum
- **Maintains schema validation** with strict type definitions

## Architecture

### Data Flow

```
Kinesis Stream
    ↓
Lambda (Aggregator) 
    ├─→ → DynamoDB (real-time aggregations)
    ├─→ → SNS (anomaly notifications)
    └─→ → S3 in Parquet Format (batch storage)
         ├── raw-events/ (event batches)
         └── aggregations/ (dimension data)
```

### S3 Buckets Created

#### 1. **Raw Events Bucket** (`event-stream-raw-{AccountId}-{Region}`)
- Stores raw event batches in Parquet format
- Prefix: `raw-events/YYYY-MM-DD/`
- Retention: 90 days (automatic deletion)
- Schema: Full event details (eventId, type, category, campaign, etc.)

#### 2. **Aggregations Bucket** (`event-stream-aggregations-{AccountId}-{Region}`)
- Stores aggregated metrics in Parquet format
- Prefix: `aggregations/YYYY-MM-DD/`
- Retention: 30 days (Standard) → 60 days (Glacier)
- Schema: Dimension-level aggregations (timeline, category, campaign, city, age, etc.)

## Implementation Details

### Parquet Schemas

#### Event Schema
```javascript
{
  eventId: UTF8 (required),
  eventType: UTF8 (required),  // page_view, product_view, add_to_cart, order
  timestamp: UTF8 (required),  // ISO 8601 format
  
  // Optional fields
  productCategory: UTF8,        // electronics, fashion, home_appliances, etc.
  campaignId: UTF8,             // cmp_flash_deal, cmp_festive_sale, etc.
  deviceType: UTF8,             // mobile, desktop, tablet, smartwatch
  city: UTF8,                   // Bengaluru, Mumbai, Pune, etc.
  segment: UTF8,                // student, working_professional, high_income, etc.
  ageGroup: UTF8,               // 13-18, 19-25, 26-35, etc.
  isAnomaly: BOOLEAN,           // Anomaly detection flag
  anomalyType: UTF8,            // bot_activity, fraud_order, price_spike
  orderValue: DOUBLE            // Revenue in currency units
}
```

#### Aggregation Schema
```javascript
{
  id: UTF8 (required),          // live#2024-12-15T14:30, cat#electronics, etc.
  
  // Event type counts
  total: INT64,
  page_view: INT64,
  product_view: INT64,
  add_to_cart: INT64,
  order: INT64,
  wishlist_add: INT64,
  
  // Financial metrics
  orders: INT64,                // Order count
  revenue: DOUBLE,              // Total revenue
  
  // Metadata
  lastSeen: UTF8,               // Last update timestamp
  createdAt: UTF8               // Creation timestamp
}
```

### Key Components

#### 1. **Parquet Writer Utility** (`src/utils/parquet-writer.js`)

Provides three main functions:

```javascript
// Write raw events to Parquet
writeEventsToParquet(records, bucket, prefix, filename)
  → Converts JSON events array to Parquet
  → Uploads to S3
  → Returns {bucket, key, size, records}

// Write aggregations to Parquet
writeAggregationsToParquet(records, bucket, prefix, filename)
  → Normalizes aggregation records
  → Writes dimension data in Parquet format
  → Uploads to S3
  → Returns {bucket, key, size, records}

// Batch write multiple datasets
writeBatchToParquet(datasets, bucket)
  → Parallel upload of multiple Parquet files
  → Handles mixed event and aggregation data
```

#### 2. **Stream Handler Integration** (`src/handlers/stream.js`)

The Kinesis stream processor now:
1. Aggregates events from Kinesis (existing)
2. Updates DynamoDB for real-time queries (existing)
3. **NEW: Writes aggregations to S3 in Parquet format (async, non-blocking)**
4. Publishes anomalies to SNS (existing)

```javascript
// Added async S3 write (fire-and-forget)
writeAggregationsToS3(aggregations, startTime)
  ├─ Converts aggregations to tabular format
  ├─ Calls writeAggregationsToParquet()
  └─ Logs result (no blocking)
```

#### 3. **CloudFormation Resources** (template.yaml)

Added to SAM template:
- **RawEventsS3Bucket**: Stores raw events with 90-day retention
- **AggregationsS3Bucket**: Stores aggregations with tiered storage (Standard → GLACIER)
- **S3WritePolicy**: IAM permissions for Lambda S3 access

#### 4. **Environment Variables** (AggregatorFunction)

```yaml
AGG_TABLE: event-stream-aggregations      # DynamoDB table
SNS_TOPIC_ARN: arn:aws:sns:...            # SNS anomaly topic
RAW_BUCKET: event-stream-raw-...          # S3 bucket for events
AGG_BUCKET: event-stream-aggregations-... # S3 bucket for aggregations
```

## File Naming Convention

### Raw Events
```
raw-events/2024-12-15/batch-2024-12-15T14-30-45Z.parquet
raw-events/2024-12-15/batch-2024-12-15T14-30-50Z.parquet
```

### Aggregations
```
aggregations/2024-12-15/aggregations-2024-12-15T14-30-45Z-aggregations.parquet
aggregations/2024-12-15/aggregations-2024-12-15T14-30-50Z-aggregations.parquet
```

## Performance Characteristics

### Compression
- Parquet files typically **80-90% smaller** than JSON
- Example: 1MB JSON events → ~150-200KB Parquet file

### Writing
- **Memory efficient**: Files written to `/tmp` then streamed to S3
- **Non-blocking**: S3 writes happen asynchronously (fire-and-forget)
- **Batch size**: Up to 10,000 aggregation records per file

### Query Performance
With Parquet files and AWS Athena:
```sql
SELECT category, SUM(revenue) as total_revenue, COUNT(*) as orders
FROM s3_aggregations_table
WHERE year=2024 AND month=12 AND day=15
GROUP BY category
ORDER BY total_revenue DESC;
```

## Deployment

### 1. Update Dependencies
```bash
cd c:\AWS-final\event-aggregator
npm install
```

This installs:
- `@aws-sdk/client-s3` - S3 client for uploads
- `parquetjs` - Apache Parquet writer

### 2. Deploy CloudFormation
```bash
cd c:\AWS-final
sam build
sam deploy
```

CloudFormation creates:
- Two S3 buckets
- Updated Lambda environment variables
- S3 write IAM permissions

### 3. Verify Deployment
```bash
aws s3 ls s3://event-stream-raw-<AccountId>-<Region>/
aws s3 ls s3://event-stream-aggregations-<AccountId>-<Region>/
```

## Monitoring & Troubleshooting

### CloudWatch Logs

The aggregator logs S3 write results:
```
✅ Uploaded aggregations to S3: s3://event-stream-aggregations.../aggregations-2024-12-15T14-30-45Z-aggregations.parquet (2048 bytes)
```

### Check File Structure

Download and inspect a Parquet file:
```bash
# Using AWS CLI
aws s3 cp s3://event-stream-aggregations-.../aggregations-*.parquet .

# Using Python to read
import pandas as pd
df = pd.read_parquet('aggregations-2024-12-15T14-30-45Z-aggregations.parquet')
print(df.head())
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "Bucket not found" | Check env vars `RAW_BUCKET`, `AGG_BUCKET` are set |
| S3 access denied | Verify Lambda IAM role has `s3:PutObject` permission |
| Temp file not found | Ensure Lambda has `/tmp` write access (default allowed) |
| Out of memory | Reduce batch size in `ParquetWriter.openFile()` |

## Querying Parquet Files

### AWS Athena
```sql
CREATE EXTERNAL TABLE IF NOT EXISTS event_aggregations (
  id string,
  total bigint,
  orders bigint,
  revenue double,
  page_view bigint,
  product_view bigint,
  add_to_cart bigint,
  `order` bigint,
  lastseen string,
  createdat string
)
STORED AS PARQUET
LOCATION 's3://event-stream-aggregations-.../aggregations/'
```

### AWS Redshift Spectrum
```sql
SELECT 
  id, 
  SUM(revenue) as total_revenue,
  count(*) as record_count
FROM event_aggregations
WHERE createdat >= '2024-12-15'
GROUP BY id
```

### Local Python Analysis
```python
import pandas as pd
from s3fs import S3FileSystem

s3 = S3FileSystem()
df = pd.read_parquet('s3://event-stream-aggregations-.../aggregations/2024-12-15/*.parquet')
print(df.describe())
print(df.groupby('id')['revenue'].sum())
```

## Benefits

✅ **Storage Efficiency**: 80-90% reduction in S3 storage costs
✅ **Query Speed**: 10-100x faster queries vs JSON with proper indexing
✅ **Analytics Ready**: Direct integration with Athena, QuickSight, Redshift
✅ **Cost Optimization**: Tiered storage (Standard → IA → Glacier)
✅ **Non-Blocking**: Async writes don't impact real-time aggregation performance
✅ **Schema Validation**: Enforced data types prevent data quality issues

## Next Steps

1. **Deploy and test** the updated stack
2. **Monitor** S3 bucket growth and CloudWatch logs
3. **Query** Parquet files using Athena for analytics
4. **Optimize** retention policies based on usage patterns
5. **Extend** to write raw events to S3 (currently DynamoDB only)

---

**Version**: 1.0  
**Last Updated**: December 15, 2024  
**Maintained By**: Data Engineering Team
