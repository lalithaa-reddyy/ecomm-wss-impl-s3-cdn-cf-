const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require("@aws-sdk/client-apigatewaymanagementapi");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || "ws-connections";
const AGG_TABLE = process.env.AGG_TABLE;
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT;

console.log("[WS-PUSH] Using tables:", { CONNECTIONS_TABLE, AGG_TABLE });

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

  const timelineItems = [];

  for (const item of items) {
    const id = item.id || "";
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
          id, total,
          page_view:    Number(item.page_view)    || 0,
          product_view: Number(item.product_view) || 0,
          add_to_cart:  Number(item.add_to_cart)  || 0,
          order:        Number(item.order)        || 0,
          lastSeen:     item.lastSeen || null
        });
        break;
      case "cat":
        metrics.categoryStats[id.substring(4)] = {
          total: Number(item.total) || 0, orders: Number(item.orders) || 0,
          revenue: Number(item.revenue) || 0, page_view: Number(item.page_view) || 0,
          product_view: Number(item.product_view) || 0, add_to_cart: Number(item.add_to_cart) || 0,
          order: Number(item.order) || 0
        };
        break;
      case "campaign":
        metrics.campaignStats[id.substring(9)] = {
          total: Number(item.total) || 0, order_count: Number(item.orders) || 0,
          revenue: Number(item.revenue) || 0
        };
        break;
      case "city":
        metrics.geoStats[id.substring(5)] = {
          total: Number(item.total) || 0, order_count: Number(item.orders) || 0,
          revenue: Number(item.revenue) || 0
        };
        break;
      case "age":
        metrics.ageStats[id.substring(4)] = {
          total: Number(item.total) || 0, order_count: Number(item.orders) || 0,
          revenue: Number(item.revenue) || 0, page_view: Number(item.page_view) || 0,
          product_view: Number(item.product_view) || 0, add_to_cart: Number(item.add_to_cart) || 0,
          order: Number(item.order) || 0
        };
        break;
      default:
        break;
    }
  }

  if (metrics.revenueStats.order_count > 0) {
    metrics.revenueStats.avg_order_value = Math.round(
      metrics.revenueStats.total_revenue / metrics.revenueStats.order_count
    );
  }

  metrics.recentMinutes = timelineItems
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, 30);

  return metrics;
}

exports.handler = async (event) => {
  try {
    // Fetch all metrics from aggregation table
    const aggResult = await ddb.send(new ScanCommand({
      TableName: AGG_TABLE,
      Limit: 300,
      FilterExpression: "attribute_exists(id)",
      ConsistentRead: false
    }));

    const metrics = parseItems(aggResult.Items || []);

    // Fetch all connected WebSocket clients
    const connResult = await ddb.send(new ScanCommand({
      TableName: CONNECTIONS_TABLE,
      ProjectionExpression: "connectionId"
    }));

    const connections = connResult.Items || [];
    console.log(`[WS-PUSH] Pushing metrics to ${connections.length} connected clients`);

    // Create API Gateway Management API client
    const apigw = new ApiGatewayManagementApiClient({
      endpoint: WEBSOCKET_ENDPOINT
    });

    // Push metrics to each connected client
    const results = await Promise.allSettled(
      connections.map(conn => {
        return apigw.send(new PostToConnectionCommand({
          ConnectionId: conn.connectionId,
          Data: Buffer.from(JSON.stringify(metrics))
        }));
      })
    );

    // Log results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    if (failed > 0) {
      console.warn(`[WS-PUSH] Delivered to ${successful}, failed ${failed}`);
    } else {
      console.log(`[WS-PUSH] Successfully pushed to all ${successful} clients`);
    }

    return { statusCode: 200, body: "Pushed" };
  } catch (err) {
    console.error("[WS-PUSH] Error:", err);
    return { statusCode: 500, body: err.message };
  }
};
