const crypto = require("crypto");
const { KinesisClient, PutRecordsCommand } = require("@aws-sdk/client-kinesis");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

const kinesis = new KinesisClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const STREAM_NAME = process.env.STREAM_NAME;
const STATE_TABLE = process.env.STATE_TABLE || "event-generator-state";

if (!STREAM_NAME) {
  throw new Error('STREAM_NAME environment variable not set');
}

/* ============ ENHANCED CONFIG ============ */

const CATEGORY_PROFILES = {
  electronics:      { weight: 10, min: 8000,  max: 25000, conversionBias: 0.08, volatility: 2.1 },
  fashion:          { weight: 22, min: 800,   max: 4500,  conversionBias: 0.10, volatility: 2.4 },
  home_appliances:  { weight: 12, min: 5000,  max: 18000, conversionBias: 0.05, volatility: 1.2 },
  beauty:           { weight: 14, min: 500,   max: 2000,  conversionBias: 0.09, volatility: 2.2 },
  sports:           { weight: 9,  min: 2000,  max: 8000,  conversionBias: 0.07, volatility: 1.8 },
  books:            { weight: 12, min: 300,   max: 1200,  conversionBias: 0.12, volatility: 1.4 },
  groceries:        { weight: 15, min: 200,   max: 800,   conversionBias: 0.06, volatility: 1.1 },
  toys:             { weight: 6,  min: 1000,  max: 4000,  conversionBias: 0.06, volatility: 1.9 }
};

const EVENT_WEIGHTS = [
  { type: "page_view",     weight: 45 },
  { type: "product_view",  weight: 30 },
  { type: "add_to_cart",   weight: 18 },
  { type: "order",         weight: 5 },
  { type: "wishlist_add",  weight: 2 }
];

const CAMPAIGN_WEIGHTS = [
  { value: "cmp_flash_deal",     weight: 28 },
  { value: "cmp_festive_sale",   weight: 22 },
  { value: "cmp_member_special", weight: 18 },
  { value: "cmp_mobile_summer",  weight: 18 },
  { value: "cmp_new_launch",     weight: 14 }
];

const DEVICE_TYPES = ["mobile", "desktop", "tablet", "smartwatch"];

const AGE_GROUP_WEIGHTS = [
  { value: "13-18", weight: 5 },
  { value: "19-25", weight: 16 },
  { value: "26-35", weight: 35 },
  { value: "36-45", weight: 24 },
  { value: "46-55", weight: 14 },
  { value: "55+",   weight: 6 }
];

const USER_SEGMENT_WEIGHTS = [
  { value: "student", weight: 8 },
  { value: "working_professional", weight: 50 },
  { value: "high_income", weight: 28 },
  { value: "frequent_shopper", weight: 14 }
];

const CITY_WEIGHTS = [
  { value: "Bengaluru",    weight: 24 },
  { value: "Mumbai",       weight: 22 },
  { value: "Pune",         weight: 16 },
  { value: "Hyderabad",    weight: 14 },
  { value: "Chennai",      weight: 10 },
  { value: "Kolkata",      weight: 8 },
  { value: "Ahmedabad",    weight: 4 },
  { value: "Jaipur",       weight: 2 }
];

const ANOMALY_PATTERNS = [
  { type: "bot_activity",  probability: 0.002 },
  { type: "fraud_attempt", probability: 0.001 },
  { type: "bulk_purchase", probability: 0.0015 },
  { type: "spike_traffic", probability: 0.003 }
];

/* ============ TEMPORAL VARIANCE ============ */

/**
 * Returns a multiplier based on time of day to simulate realistic user behavior
 * Normalized to 0.7-1.3 range to simulate realistic variance in user behavior
 * 
 * @returns {number} Temporal multiplier between 0.7 and 1.3
 */
function getTemporalMultiplier() {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0=Sunday, 6=Saturday
  
  // Normalized time-of-day multipliers for 0.7-1.3 range
  // Peak hours: 9-12, 14-17, 19-21 map to ~1.2-1.3
  // Medium hours: 8, 13, 18, 22 map to ~1.0-1.1
  // Low hours: 0-7, 23 map to ~0.7-0.9
  const hourMultipliers = {
    0: 0.7,    // 12am - very low (night)
    1: 0.68,   // 1am
    2: 0.65,   // 2am - lowest
    3: 0.65,   // 3am
    4: 0.68,   // 4am
    5: 0.78,   // 5am - early risers
    6: 0.85,   // 6am - early risers increase
    7: 0.92,   // 7am - morning commute
    8: 1.05,   // 8am - high (work start)
    9: 1.25,   // 9am - peak (work day + shopping)
    10: 1.28,  // 10am - peak
    11: 1.25,  // 11am - peak
    12: 1.22,  // 12pm - peak (lunch time)
    13: 1.10,  // 1pm - medium (post-lunch)
    14: 1.28,  // 2pm - peak (afternoon work)
    15: 1.30,  // 3pm - peak
    16: 1.28,  // 4pm - peak
    17: 1.25,  // 5pm - peak (end of work)
    18: 1.18,  // 6pm - high (evening shopping)
    19: 1.28,  // 7pm - peak (evening shopping)
    20: 1.25,  // 8pm - peak
    21: 1.22,  // 9pm - high (evening browsing)
    22: 1.08,  // 10pm - medium (late night)
    23: 0.88   // 11pm - low (before bed)
  };

  let multiplier = hourMultipliers[hour] || 1.0;

  // Weekend boost maintains 0.7-1.3 range (slight increase but capped)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    multiplier = Math.min(1.3, multiplier * 1.08);  // +8% on weekends, capped at 1.3
  }

  // Random variance within 0.7-1.3 band
  // Add micro-variance (±3%) to simulate real-time fluctuations
  const microVariance = 0.97 + Math.random() * 0.06;
  multiplier *= microVariance;

  // Ensure final multiplier stays within 0.7-1.3 range
  return Math.max(0.7, Math.min(1.3, multiplier));
}

/**
 * Calculate expected events based on rate and temporal variance
 */
function calculateEventsPerSecond(baseRate) {
  const temporalMultiplier = getTemporalMultiplier();
  const adjustedRate = baseRate * temporalMultiplier;
  return Math.ceil(adjustedRate / 60);
}

/* ============ WEIGHTED PICKER ============ */

const weightedPick = (items) => {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[0];
};

const pickCategory = () =>
  weightedPick(Object.entries(CATEGORY_PROFILES).map(([k, v]) => ({ category: k, weight: v.weight }))).category;

const pickEventType = () => weightedPick(EVENT_WEIGHTS).type;
const pickCampaign = () => weightedPick(CAMPAIGN_WEIGHTS).value;
const pickAgeGroup = () => weightedPick(AGE_GROUP_WEIGHTS).value;
const pickSegment = () => weightedPick(USER_SEGMENT_WEIGHTS).value;
const pickCity = () => weightedPick(CITY_WEIGHTS).value;
const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const getOrderValue = (category) => {
  const p = CATEGORY_PROFILES[category];
  const base = Math.floor(Math.random() * (p.max - p.min)) + p.min;
  // Add volatility for realistic pricing variations
  const volatility = 1 + (Math.random() - 0.5) * p.volatility / 100;
  return Math.floor(base * volatility);
};

/* ============ ANOMALY DETECTION ============ */

const checkAnomalies = () => {
  for (const pattern of ANOMALY_PATTERNS) {
    if (Math.random() < pattern.probability) {
      return { isAnomaly: true, anomalyType: pattern.type };
    }
  }
  return { isAnomaly: false, anomalyType: null };
};

/* ============ STATE MANAGEMENT ============ */

async function getGenerationState() {
  try {
    const result = await ddb.send(new GetCommand({
      TableName: STATE_TABLE,
      Key: { generatorId: "default" }
    }));
    return result.Item || { 
      generatorId: "default", 
      status: "stopped", 
      rate: 70000, 
      startTime: null 
    };
  } catch (err) {
    console.warn("[STATE] Failed to get state:", err.message);
    return { 
      generatorId: "default", 
      status: "stopped", 
      rate: 70000, 
      startTime: null 
    };
  }
}

async function setGenerationState(status, rate, startTime) {
  try {
    await ddb.send(new PutCommand({
      TableName: STATE_TABLE,
      Item: {
        generatorId: "default",
        status,
        rate,
        startTime,
        lastUpdated: new Date().toISOString()
      }
    }));
    console.log(`[STATE] Generation state set to: ${status}`);
  } catch (err) {
    console.error("[STATE] Failed to set state:", err.message);
  }
}

/* ============ ENHANCED EVENT GENERATION ============ */

function generateEnhancedEvent() {
  const category = pickCategory();
  const segment = pickSegment();
  let eventType = pickEventType();
  
  const categoryProfile = CATEGORY_PROFILES[category];

  // Segment-based conversion bias (high income converts more)
  const segmentBias = {
    "student": 0.03,
    "working_professional": 0.08,
    "high_income": 0.15,
    "frequent_shopper": 0.12
  }[segment] || 0.08;

  // Add-to-cart → order conversion
  if (eventType === "add_to_cart" && Math.random() < segmentBias * categoryProfile.conversionBias) {
    eventType = "order";
  }

  const orderValue = eventType === "order" ? getOrderValue(category) : 0;
  
  // Check for anomalies
  const { isAnomaly, anomalyType } = checkAnomalies();

  const event = {
    eventId: crypto.randomUUID(),
    userId: `user-${Math.floor(Math.random() * 500000)}`,
    deviceId: `device-${crypto.randomUUID()}`,
    eventType,
    productCategory: category,
    campaignId: pickCampaign(),
    deviceType: randomFrom(DEVICE_TYPES),
    segment,
    ageGroup: pickAgeGroup(),
    city: pickCity(),
    orderValue,
    price: orderValue,
    isAnomaly,
    anomalyType,
    timestamp: new Date().toISOString(),
    sessionId: `session-${Math.floor(Math.random() * 100000)}`,
    referrerType: randomFrom(["organic", "paid", "direct", "social", "email"]),
    platform: randomFrom(["web", "mobile_app", "tablet_app"]),
    conversionValue: orderValue > 0 ? orderValue : 0
  };

  return event;
}

function generateWeightedEvents(count) {
  return Array.from({ length: count }, () => generateEnhancedEvent());
}

/* ============ KINESIS STREAMING ============ */

async function streamEventsToKinesis(events, maxRetries = 3) {
  if (!events || events.length === 0) return;

  const recordsToSend = events.map(e => ({
    Data: Buffer.from(JSON.stringify(e)),
    PartitionKey: `${e.productCategory}-${Math.floor(Math.random() * 10)}`
  }));

  // Stream in batches (Kinesis max = 500)
  for (let i = 0; i < recordsToSend.length; i += 500) {
    const batch = recordsToSend.slice(i, i + 500);
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        const result = await kinesis.send(
          new PutRecordsCommand({
            StreamName: STREAM_NAME,
            Records: batch
          })
        );

        if (result.FailedRecordCount > 0) {
          console.warn(`⚠️  ${result.FailedRecordCount}/${batch.length} records failed`);
        } else {
          console.log(`✅ Streamed ${batch.length} events to Kinesis`);
        }
        break;
      } catch (err) {
        attempts++;
        if (attempts >= maxRetries) {
          console.error(`❌ Failed after ${maxRetries} attempts:`, err.message);
          throw err;
        }
        await new Promise(res => setTimeout(res, 100 * Math.pow(2, attempts - 1)));
      }
    }
  }
}

/* ============ LAMBDA HANDLER ============ */

exports.handler = async (event) => {
  console.log("📨 Received event:", JSON.stringify(event));
  const executionId = crypto.randomBytes(6).toString('hex');
  const invocationStart = Date.now();

  try {
    const body = event.body ? JSON.parse(event.body) : event;
    const action = body.action || "start";
    const rate = body.rate || 70000;
    const disableTemporal = body.disableTemporal === true;

    if (action === "start") {
      // Check if already running
      const currentState = await getGenerationState();
      if (currentState.status === "running") {
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: "⚡ Generation already running",
            status: "running",
            rate: currentState.rate,
            startTime: currentState.startTime,
            elapsedSeconds: Math.floor((Date.now() - new Date(currentState.startTime).getTime()) / 1000)
          })
        };
      }

      // Validate rate
      if (rate < 50000) {
        console.warn(`⚠️  Rate ${rate} is below minimum 50,000 per minute. Adjusting to 50,000.`);
        rate = 50000;
      }

      // Set state to "running"
      await setGenerationState("running", rate, new Date().toISOString());

      console.log(JSON.stringify({
        eventType: "EXECUTION_START",
        executionId,
        timestamp: new Date().toISOString(),
        action,
        configuredRate: rate,
        temporalVarianceEnabled: !disableTemporal
      }));

      console.log(`🚀 Starting continuous event generation: ${rate}/min`);

      // Continuous generation loop (runs until stopped or Lambda timeout ~15min)
      let totalGenerated = 0;
      let failedEvents = 0;
      const eventsBySecond = [];
      const maxExecutionTime = 900000; // 15 minutes in ms (Lambda limit is ~15min)

      while (true) {
        // Check if state is still "running"
        const state = await getGenerationState();
        if (state.status !== "running") {
          console.log("[GEN] State changed to stopped, ending generation");
          break;
        }

        // Check execution time (safety limit)
        const elapsed = Date.now() - invocationStart;
        if (elapsed > maxExecutionTime) {
          console.warn("[GEN] Max execution time reached, stopping");
          break;
        }

        // Generate events
        let adjustedRate = rate / 60;
        if (!disableTemporal) {
          const temporalMultiplier = getTemporalMultiplier();
          adjustedRate = Math.round(adjustedRate * temporalMultiplier);
        }

        const events = generateWeightedEvents(Math.round(adjustedRate));

        try {
          await streamEventsToKinesis(events);
          totalGenerated += events.length;
          eventsBySecond.push(events.length);

          console.log(JSON.stringify({
            eventType: "GENERATION_BATCH",
            executionId,
            timestamp: new Date().toISOString(),
            batchSize: events.length,
            cumulativeTotal: totalGenerated,
            elapsedSeconds: Math.floor(elapsed / 1000)
          }));
        } catch (err) {
          failedEvents += events.length;
          console.error(JSON.stringify({
            eventType: "GENERATION_ERROR",
            executionId,
            timestamp: new Date().toISOString(),
            error: err.message,
            failedCount: events.length
          }));
        }

        // Wait 1 second before next batch
        await new Promise(res => setTimeout(res, 1000));
      }

      const executionTime = Date.now() - invocationStart;
      const averagePerSecond = eventsBySecond.length > 0
        ? Math.round(eventsBySecond.reduce((a, b) => a + b, 0) / eventsBySecond.length)
        : 0;

      // Reset state to stopped
      await setGenerationState("stopped", 0, null);

      const summaryLog = {
        eventType: "GENERATION_COMPLETE",
        executionId,
        timestamp: new Date().toISOString(),
        TOTAL_EVENTS_GENERATED: totalGenerated,
        totalFailed: failedEvents,
        totalSuccessful: totalGenerated - failedEvents,
        configuredRate: rate,
        actualRate: Math.round(totalGenerated / (executionTime / 60000)),
        averagePerSecond,
        durationSeconds: Math.floor(executionTime / 1000),
        executionTimeMs: executionTime,
        successRate: totalGenerated > 0 ? ((totalGenerated - failedEvents) / totalGenerated * 100).toFixed(2) + '%' : 'N/A'
      };
      console.log(JSON.stringify(summaryLog));

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "✅ Continuous generation completed",
          totalGenerated,
          failedEvents,
          eventsPerMinute: rate,
          actualRate: Math.round(totalGenerated / (executionTime / 60000)),
          durationSeconds: Math.floor(executionTime / 1000),
          averagePerSecond,
          timestamp: new Date().toISOString(),
          executionId
        })
      };
    } else if (action === "stop") {
      // Set state to "stopped"
      await setGenerationState("stopped", 0, null);

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "⏹️  Generation stop signal sent",
          status: "stopped",
          timestamp: new Date().toISOString()
        })
      };
    } else if (action === "status") {
      // Get current generation status
      const state = await getGenerationState();
      const elapsedSeconds = state.startTime 
        ? Math.floor((Date.now() - new Date(state.startTime).getTime()) / 1000)
        : 0;

      return {
        statusCode: 200,
        body: JSON.stringify({
          status: state.status,
          rate: state.rate,
          startTime: state.startTime,
          elapsedSeconds,
          lastUpdated: state.lastUpdated,
          timestamp: new Date().toISOString()
        })
      };
    } else if (action === "health") {
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: "✅ OK",
          minimumRate: 50000,
          defaultRate: 70000,
          maxDuration: 900,
          temporalVariance: "Enabled by default (0.7-1.3)",
          timestamp: new Date().toISOString()
        })
      };
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Invalid action",
          validActions: ["start", "stop", "status", "health"],
          notes: "start: begins continuous generation, stop: ends generation, status: check current state",
          example: {
            action: "start",
            rate: 70000,
            disableTemporal: false
          }
        })
      };
    }
  } catch (err) {
    console.error("[HANDLER] Error:", err.message, err.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};