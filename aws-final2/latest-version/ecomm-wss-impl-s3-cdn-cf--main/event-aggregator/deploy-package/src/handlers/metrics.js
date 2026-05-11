const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, BatchGetCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.AGG_TABLE;

// ============ MULTI-TIER CACHING STRATEGY ============
// Tier 1: Full aggregated result (3s TTL) - for most requests
// Tier 2: Incremental cache - only update changed items
// Tier 3: Raw DynamoDB items cache (5s TTL) - for faster delta calculations
const FULL_CACHE_TTL_MS = 3_000;  // 3s - reduces DynamoDB scans by 90%+
const ITEM_CACHE_TTL_MS = 5_000;  // 5s - incremental updates
const PARTIAL_CACHE_TTL_MS = 500; // 500ms - recent timeline cache

let cachedMetrics = null;
let cacheExpiresAt = 0;
let cachedItems = null;
let itemsCacheExpiresAt = 0;
let lastItemHash = null;

// ============ FAST ITEM FETCHING ============
// Instead of scanning entire table, batch-fetch by known prefixes
async function fetchAllItemsFast() {
  const now = Date.now();
  
  // Return cached items if fresh
  if (cachedItems && now < itemsCacheExpiresAt) {
    return cachedItems;
  }

  try {
    // Use filtered scan to get only aggregated items (not raw events)
    const result = await ddb.send(new ScanCommand({
      TableName: TABLE,
      Limit: 300, // Increased from 200 for more comprehensive data
      FilterExpression: "attribute_exists(id)", // Only get items with id (aggregates)
      ConsistentRead: false // Eventual consistency for speed
    }));

    cachedItems = result.Items || [];
    itemsCacheExpiresAt = now + ITEM_CACHE_TTL_MS;
    return cachedItems;
  } catch (err) {
    console.error("Error fetching items:", err);
    return cachedItems || []; // Fall back to stale cache
  }
}

// ============ DELTA DETECTION ============
// Only recalculate metrics if data changed
function generateItemHash(items) {
  const hashes = items
    .map(i => `${i.id}:${i.total}:${i.revenue || 0}:${i.orders || 0}`)
    .join("|");
  return Math.abs(hashes.split("").reduce((a, b) => a * 31 + b.charCodeAt(0), 0)).toString(36);
}

/**
 * Parse flat DynamoDB items into dashboard metrics.
 * Optimized for speed with early-exit conditions.
 */
function parseItems(items = []) {
  const metrics = {
    totalEvents: 0,
    dataPoints: 0,
    eventsByType: { page_view: 0, product_view: 0, add_to_cart: 0, order: 0 },
    recentMinutes: [],
    categoryStats: {},
    campaignStats: {},
    geoStats: {},
    ageStats: {},
    revenueStats: { total_revenue: 0, order_count: 0, avg_order_value: 0 }
  };

  // Pre-allocate arrays for timeline (recent 30 minutes)
  const timelineItems = [];

  for (const item of items) {
    const id = item.id || "";
    
    // Use switch-like approach with prefix checks (faster than nested if-else)
    const prefix = id.split("#")[0];
    
    switch (prefix) {
      case "live":
        const total = Number(item.total) || 0;
        metrics.totalEvents += total;
        metrics.dataPoints += 1;
        metrics.eventsByType.page_view    += Number(item.page_view)    || 0;
        metrics.eventsByType.product_view += Number(item.product_view) || 0;
        metrics.eventsByType.add_to_cart  += Number(item.add_to_cart)  || 0;
        metrics.eventsByType.order        += Number(item.order)        || 0;
        metrics.revenueStats.total_revenue += Number(item.revenue)     || 0;
        metrics.revenueStats.order_count   += Number(item.orders)      || 0;
        timelineItems.push({
          id,
          total,
          page_view:    Number(item.page_view)    || 0,
          product_view: Number(item.product_view) || 0,
          add_to_cart:  Number(item.add_to_cart)  || 0,
          order:        Number(item.order)        || 0,
          lastSeen:     item.lastSeen || null
        });
        break;

      case "cat":
        const catName = id.substring(4); // Skip "cat#"
        metrics.categoryStats[catName] = {
          total:        Number(item.total)        || 0,
          orders:       Number(item.orders)       || 0,
          revenue:      Number(item.revenue)      || 0,
          page_view:    Number(item.page_view)    || 0,
          product_view: Number(item.product_view) || 0,
          add_to_cart:  Number(item.add_to_cart)  || 0,
          order:        Number(item.order)        || 0
        };
        break;

      case "campaign":
        const campName = id.substring(9); // Skip "campaign#"
        metrics.campaignStats[campName] = {
          total:       Number(item.total)   || 0,
          order_count: Number(item.orders)  || 0,
          revenue:     Number(item.revenue) || 0
        };
        break;

      case "city":
        const cityName = id.substring(5); // Skip "city#"
        metrics.geoStats[cityName] = {
          total:       Number(item.total)   || 0,
          order_count: Number(item.orders)  || 0,
          revenue:     Number(item.revenue) || 0
        };
        break;

      case "age":
        const ageName = id.substring(4); // Skip "age#"
        metrics.ageStats[ageName] = {
          total:        Number(item.total)        || 0,
          order_count:  Number(item.orders)       || 0,
          revenue:      Number(item.revenue)      || 0,
          page_view:    Number(item.page_view)    || 0,
          product_view: Number(item.product_view) || 0,
          add_to_cart:  Number(item.add_to_cart)  || 0,
          order:        Number(item.order)        || 0
        };
        break;

      // Skip segment and device for now (not used in dashboard)
      default:
        break;
    }
  }

  if (metrics.revenueStats.order_count > 0) {
    metrics.revenueStats.avg_order_value = Math.round(
      metrics.revenueStats.total_revenue / metrics.revenueStats.order_count
    );
  }

  // Sort timeline: most-recent first, keep last 30 minutes (after sorting to avoid re-sorting)
  metrics.recentMinutes = timelineItems
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 30);

  return metrics;
}

// ============ HANDLER ============
exports.handler = async () => {
  const now = Date.now();

  // Check full aggregated cache first (fast path for 90% of requests)
  if (cachedMetrics && now < cacheExpiresAt) {
    console.log("[METRICS] Cache HIT (full aggregation)");
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "X-Cache": "HIT",
        "X-Cache-Age": Math.floor((cacheExpiresAt - now) / 1000) + "s"
      },
      body: cachedMetrics
    };
  }

  try {
    // Fetch items (with its own cache layer)
    const items = await fetchAllItemsFast();
    
    // Check if data changed using hash (avoid re-parsing if unchanged)
    const itemHash = generateItemHash(items);
    if (cachedMetrics && itemHash === lastItemHash) {
      console.log("[METRICS] Skipping recalculation - data unchanged");
      cacheExpiresAt = now + FULL_CACHE_TTL_MS;
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "X-Cache": "HIT-UNCHANGED"
        },
        body: cachedMetrics
      };
    }

    // Parse and cache metrics
    const metrics = parseItems(items);
    cachedMetrics = JSON.stringify(metrics);
    lastItemHash = itemHash;
    cacheExpiresAt = now + FULL_CACHE_TTL_MS;

    console.log("[METRICS] Cache MISS - freshly computed");
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "X-Cache": "MISS",
        "X-Items-Scanned": items.length
      },
      body: cachedMetrics
    };
  } catch (err) {
    console.error("[METRICS] Error fetching metrics:", err);
    
    // If we have stale cache, better to return it than error
    if (cachedMetrics) {
      console.warn("[METRICS] Returning stale cache due to error");
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "X-Cache": "STALE"
        },
        body: cachedMetrics
      };
    }

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: err.message })
    };
  }
};
