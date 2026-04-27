const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, BatchGetCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.AGG_TABLE;

async function fetchAllItemsFast() {
  try {
    // Always scan - no caching
    const result = await ddb.send(new ScanCommand({
      TableName: TABLE,
      Limit: 300, // Scan up to 300 items
      FilterExpression: "attribute_exists(id)", // Only get items with id (aggregates)
      ConsistentRead: false // Eventual consistency for speed
    }));

    const items = result.Items || [];
    console.log(`[METRICS] Scanned ${items.length} items from DynamoDB`);
    return items;
  } catch (err) {
    console.error("Error fetching items:", err);
    throw err;
  }
}

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
  const startTime = Date.now();

  try {
    // Always scan fresh from DynamoDB - no caching
    const items = await fetchAllItemsFast();
    
    // Parse metrics immediately
    const metrics = parseItems(items);
    const metricsJson = JSON.stringify(metrics);
    const scanDuration = Date.now() - startTime;

    console.log(`[METRICS] Fresh scan complete: ${items.length} items in ${scanDuration}ms`);
    
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "X-Items-Scanned": items.length,
        "X-Scan-Duration-Ms": scanDuration
      },
      body: metricsJson
    };
  } catch (err) {
    console.error("[METRICS] Error fetching metrics:", err);
    
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
