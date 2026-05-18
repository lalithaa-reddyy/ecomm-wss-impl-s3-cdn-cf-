# Event Rate & Temporal Variance Configuration

## Overview
The event generator now supports a **minimum rate of 50,000 events per minute** with **temporal variance between 0.7 and 1.3** to simulate realistic user behavior patterns.

## Configuration Details

### Event Rate
- **Minimum Rate**: 50,000 events per minute
- **Default Rate**: 50,000 events per minute
- **Configurable**: Yes, via request body or CloudFormation template
- **Auto-Enforcement**: Rates below 50,000 are automatically adjusted to 50,000 with a warning

```javascript
const rate = body.rate || 50000;  // Defaults to 50,000/min
if (rate < 50000) {
  console.warn(`Rate ${rate} is below minimum 50,000/min. Adjusting to 50,000.`);
  rate = 50000;
}
```

### Temporal Variance (0.7 - 1.3)

The system applies a **normalized temporal multiplier** in the range **0.7 to 1.3** to simulate realistic user behavior:

#### Hour-Based Multipliers (normalized)
- **Night (0-7 AM, 11 PM)**: 0.65-0.92 (low traffic)
  - 2-3 AM: 0.65 (lowest point)
  - 5-6 AM: 0.78-0.85 (early risers)
  - 7 AM: 0.92 (morning commute begins)

- **Business Hours (8 AM-5 PM)**: 1.05-1.30 (peak traffic)
  - 8 AM: 1.05 (work day starts)
  - 9-11 AM: 1.25-1.28 (peak work/shopping)
  - 2-3 PM: 1.28-1.30 (afternoon peak)

- **Evening (6-10 PM)**: 1.18-1.28 (high shopping activity)
  - 7-8 PM: 1.28 (peak evening shopping)
  - 10 PM: 1.08 (late night decrease)

- **Pre-Midnight (11 PM)**: 0.88 (wind-down)

#### Weekend Boost
- **Saturday & Sunday**: +8% multiplier (capped at 1.3 maximum)
- Maintains realistic weekend shopping patterns while staying within bounds

#### Micro-Variance
- **Per-Second Randomness**: ±3% additional variance
- Prevents predictable patterns while maintaining controlled chaos
- Final calculation: `multiplier ± 3%` within bounds

### Actual Events Per Second
The actual number of events generated per second varies based on:

```javascript
const temporalMultiplier = getTemporalMultiplier();  // 0.7 - 1.3
const adjustedRate = Math.round((rate / 60) * temporalMultiplier);
const events = generateWeightedEvents(adjustedRate);
```

#### Example Calculations
**Base Rate**: 50,000 events/min = ~833 events/sec

| Time of Day | Multiplier | Events/Sec | Events/Min |
|-------------|-----------|-----------|-----------|
| 2 AM (lowest) | 0.65 | ~541 | ~32,460 |
| 6 AM (early risers) | 0.85 | ~708 | ~42,480 |
| 9 AM (peak) | 1.25 | ~1,041 | ~62,460 |
| 3 PM (afternoon peak) | 1.30 | ~1,083 | ~64,980 |
| 10 PM (late night) | 1.08 | ~899 | ~53,940 |
| 11 PM (pre-midnight) | 0.88 | ~732 | ~43,920 |

## User Behavior Simulation

The temporal variance model simulates:

1. **Diurnal Patterns**: Lower traffic at night, peak during work/shopping hours
2. **Work Schedule**: 9 AM-5 PM peaks with lunch dip at 1 PM
3. **Shopping Behavior**: Evening surge (7-8 PM) from work-from-home and after-work browsing
4. **Weekend Effect**: Slightly elevated weekend traffic
5. **Randomness**: Micro-variance (±3%) prevents predictability

## Usage Examples

### Deploy with Default 50,000 Rate
```bash
sam deploy --parameter-overrides EventRate=50000
```

### Start Stream via API
```bash
curl -X POST https://api-endpoint/prod/generate \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start",
    "rate": 50000,
    "duration": 60,
    "attempts": 1
  }'
```

### Start Stream with Custom Rate
```bash
curl -X POST https://api-endpoint/prod/generate \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start",
    "rate": 75000,  # Higher than minimum
    "duration": 120,
    "attempts": 2
  }'
```

### Health Check
```bash
curl -X POST https://api-endpoint/prod/generate \
  -H "Content-Type: application/json" \
  -d '{"action": "health"}'
```

Response includes:
```json
{
  "status": "✅ OK",
  "streamingActive": false,
  "minimumRate": 50000,
  "temporalVariance": "0.7 - 1.3",
  "timestamp": "2026-04-14T10:30:00.000Z"
}
```

## Performance Characteristics

### 50,000 Events/Min Baseline
- **Raw Throughput**: 833 events/second
- **Temporal Variance Range**: 541-1,083 events/second (65-130% of baseline)
- **Peak Capacity**: ~65,000 events/minute
- **Valley Capacity**: ~32,460 events/minute

### Kinesis Stream Implications
- **Recommended Shards**: 2-4 shards (for 50,000 events/min)
- **Each shard capacity**: 1,000 events/second
- **Batch Size**: 500 records/put (Kinesis maximum)
- **Partition Strategy**: Events distributed by `${productCategory}-${randomKey}` to balance across shards

## Event Structure
Each event includes temporal metadata:
```javascript
{
  eventId: "uuid",
  userId: "user-${id}",
  deviceId: "device-${uuid}",
  eventType: "page_view|product_view|add_to_cart|order|wishlist_add",
  productCategory: "electronics|fashion|home_appliances|...",
  campaignId: "cmp_*",
  deviceType: "mobile|desktop|tablet|smartwatch",
  segment: "student|working_professional|high_income|frequent_shopper",
  ageGroup: "13-18|19-25|26-35|36-45|46-55|55+",
  city: "Bengaluru|Mumbai|Pune|...",
  timestamp: "ISO-8601",
  sessionId: "session-${id}",
  // ... additional fields
}
```

## Implementation Files Changed

1. **event-generator/app/handler.js**
   - Updated `getTemporalMultiplier()` for 0.7-1.3 normalized range
   - Updated `exports.handler` to use 50,000 default rate
   - Added rate validation and temporal variance logging
   - Enhanced response with temporal variance information

2. **template.yaml**
   - Updated `EventRate` parameter default from 5,000 to 50,000
   - Updated description to reflect minimum and variance requirements

## Testing Approach

1. **Unit Tests**: Verify multiplier stays within 0.7-1.3 bounds
2. **Integration Tests**: Confirm 50,000+ events/min throughput with variance
3. **Performance Tests**: Validate Kinesis stream handles peak loads
4. **Temporal Tests**: Verify multiplier variations across different hours/days

## Monitoring & Alerts

Recommended CloudWatch metrics:
- `EventsGeneratedPerMinute` (with temporal variance applied)
- `TemporalMultiplier` (track variance patterns)
- `KinesisRecordsPut` (monitor stream capacity usage)
- `FailedEventCount` (detect throughput issues)

## Future Enhancements

- [ ] Geographic distribution variance (peak hours differ by region)
- [ ] Campaign surge events (flash sales, promotions)
- [ ] Seasonal patterns (holidays, shopping seasons)
- [ ] A/B testing support for different temporal profiles
- [ ] Real-time variance adjustment based on DynamoDB load
