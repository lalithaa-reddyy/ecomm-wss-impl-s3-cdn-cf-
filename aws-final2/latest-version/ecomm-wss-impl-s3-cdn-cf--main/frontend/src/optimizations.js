/**
 * Frontend Optimization Config
 * Implements Phase 1 quick wins: reduced fields, pagination config, caching
 */

// ============================================================================
// 1. REDUCED FIELD SETS - Display only essential columns
// ============================================================================

// Core fields for main table view (10 fields)
export const DISPLAY_FIELDS_CORE = [
  'event_id',
  'event_type',
  'product_category',
  'campaign_id',
  'city',
  'device_type',
  'order_value',
  'is_anomaly',
  'anomaly_type',
  'event_timestamp'
];

// Detail fields shown on row expansion or side panel (29 additional fields)
export const DISPLAY_FIELDS_DETAIL = [
  'user_segment',
  'age_group',
  'gender',
  'browser',
  'os',
  'ip_address',
  'user_id',
  'device_id',
  'country',
  'region',
  'price',
  'last_price',
  'mean_price',
  'std_dev',
  'price_updates_last_min',
  'is_spike',
  'spike_reason',
  'user_avg_order_value',
  'orders_last_minute',
  'geo_mismatch',
  'failed_attempts',
  'is_fraud',
  'fraud_reason',
  'schema_version',
  'year',
  'month',
  'day',
  'hour',
  'ingestion_time'
];

// For anomaly table (12 key fields)
export const DISPLAY_FIELDS_ANOMALY = [
  'event_id',
  'event_type',
  'anomaly_type',
  'is_fraud',
  'fraud_reason',
  'is_spike',
  'spike_reason',
  'order_value',
  'campaign_id',
  'city',
  'event_timestamp',
  'user_id'
];

// ============================================================================
// 2. API RESPONSE CACHING
// ============================================================================

class APICache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  /**
   * Get cached response or null if expired
   */
  get(key) {
    return this.cache.get(key) || null;
  }

  /**
   * Set cache with TTL
   */
  set(key, value, ttlMs = 2000) {
    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Store value
    this.cache.set(key, value);

    // Set expiration
    const timer = setTimeout(() => {
      this.cache.delete(key);
      this.timers.delete(key);
    }, ttlMs);

    this.timers.set(key, timer);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.forEach((_, key) => clearTimeout(this.timers.get(key)));
    this.cache.clear();
    this.timers.clear();
  }

  /**
   * Get cache stats
   */
  stats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

export const metricsCache = new APICache();

// ============================================================================
// 3. SMART FETCH WITH CACHING
// ============================================================================

/**
 * Fetch metrics with built-in caching
 * Returns cached response if available, otherwise fetches fresh data
 * 
 * Usage:
 *   const metrics = await fetchMetricsWithCache(apiEndpoint);
 */
export async function fetchMetricsWithCache(endpoint, cacheTtl = 2000) {
  const cacheKey = 'metrics';

  // Check cache first
  const cached = metricsCache.get(cacheKey);
  if (cached) {
    console.log('[CACHE HIT] Using cached metrics');
    return cached;
  }

  console.log('[CACHE MISS] Fetching fresh metrics');

  try {
    const response = await fetch(`${endpoint}/stream`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    // Cache for next requests
    metricsCache.set(cacheKey, data, cacheTtl);

    return data;
  } catch (err) {
    console.error('[FETCH ERROR]', err.message);
    
    // Fall back to stale cache if available
    const stale = metricsCache.get(cacheKey);
    if (stale) {
      console.warn('[FALLBACK] Using stale cached data');
      return stale;
    }

    throw err;
  }
}

// ============================================================================
// 4. PAGINATION CONFIG
// ============================================================================

export const PAGINATION_CONFIG = {
  // Event table settings
  PAGES_SIZE: 50,              // Rows per page (reduced from 100)
  MAX_EVENTS_IN_MEMORY: 500,   // Keep last 500 events max
  VIRTUAL_SCROLL_BUFFER: 5,    // Extra rows to render outside viewport
  
  // Anomaly table settings
  ANOMALY_PAGE_SIZE: 25,
  MAX_ANOMALIES_IN_MEMORY: 200,
  
  // API settings
  API_INTERVAL_MS: 5000,       // Refresh every 5 seconds
  API_TIMEOUT_MS: 10000,       // Timeout after 10 seconds
};

// ============================================================================
// 5. BATCH SIZE CONFIG FOR BACKEND
// ============================================================================

export const BATCH_CONFIG = {
  // Maximum events to generate per batch
  MAX_BATCH_SIZE: 3000,
  
  // Target rate without variance
  BASE_RATE_PER_MIN: 10000,
  
  // Temporal variance
  VARIANCE_MIN: 0.7,    // 70% of base rate
  VARIANCE_MAX: 1.3,    // 130% of base rate
  
  // Helps compute actual batch size with variance
  getVariableBatchSize: function() {
    const variance = this.VARIANCE_MIN + Math.random() * (this.VARIANCE_MAX - this.VARIANCE_MIN);
    let size = Math.floor(this.BASE_RATE_PER_MIN * variance);
    
    // Cap to max
    if (size > this.MAX_BATCH_SIZE) {
      console.warn(`Batch size ${size} exceeds max ${this.MAX_BATCH_SIZE}, capping`);
      size = this.MAX_BATCH_SIZE;
    }
    
    return size;
  }
};

// ============================================================================
// 6. DASHBOARD REFRESH STRATEGY
// ============================================================================

/**
 * Intelligent refresh that adapts based on data change rate
 * Reduces API calls during stable periods, increases during high activity
 */
export class AdaptiveRefresh {
  constructor() {
    this.lastMetrics = null;
    this.changeCount = 0;
    this.baseInterval = 5000;
    this.interval = this.baseInterval;
    this.lastChange = Date.now();
  }

  /**
   * Calculate next refresh interval based on change rate
   * Fast when data changing frequently, slower when stable
   */
  getNextInterval(currentMetrics) {
    const hasChange = this.hasSignificantChange(currentMetrics);

    if (hasChange) {
      this.changeCount += 1;
      this.lastChange = Date.now();
      this.interval = this.baseInterval;  // Fast refresh
    } else {
      const timeSinceChange = Date.now() - this.lastChange;
      
      // Gradually increase interval up to 15 seconds if data stable
      if (timeSinceChange > 30000 && this.interval < 15000) {
        this.interval = Math.min(this.interval + 500, 15000);
      }
    }

    this.lastMetrics = currentMetrics;
    return this.interval;
  }

  /**
   * Check if metrics have significant change (>5% variance in totals)
   */
  hasSignificantChange(metrics) {
    if (!this.lastMetrics) return true;

    const lastTotal = this.lastMetrics.totalEvents || 0;
    const currentTotal = metrics.totalEvents || 0;
    
    if (lastTotal === 0) return currentTotal > 0;
    if (currentTotal === 0) return lastTotal > 0;

    const change = Math.abs(currentTotal - lastTotal) / lastTotal;
    return change > 0.05;  // 5% threshold
  }

  /**
   * Get metrics for debugging
   */
  stats() {
    return {
      currentInterval: this.interval,
      baseInterval: this.baseInterval,
      changeCount: this.changeCount,
      timeSinceLastChange: Date.now() - this.lastChange
    };
  }
}

// ============================================================================
// 7. PERFORMANCE MONITORING UTILITIES
// ============================================================================

/**
 * Track and report performance metrics
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      apiCalls: [],
      renderTimes: [],
      domNodeCount: [],
      memoryUsage: []
    };
    this.enabled = true;
  }

  /**
   * Record API call duration
   */
  recordAPICall(duration, success = true) {
    if (!this.enabled) return;
    this.metrics.apiCalls.push({ duration, success, timestamp: Date.now() });
  }

  /**
   * Record component render time
   */
  recordRender(componentName, duration) {
    if (!this.enabled) return;
    this.metrics.renderTimes.push({ component: componentName, duration, timestamp: Date.now() });
  }

  /**
   * Record DOM node count (for virtual scroll validation)
   */
  recordDOMNodes(count) {
    if (!this.enabled) return;
    this.metrics.domNodeCount.push({ count, timestamp: Date.now() });
  }

  /**
   * Get averaged metrics
   */
  getReport() {
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const last10API = this.metrics.apiCalls.slice(-10).map(m => m.duration);
    const last10Render = this.metrics.renderTimes.slice(-10).map(m => m.duration);

    return {
      avgAPIResponse: avg(last10API).toFixed(0) + 'ms',
      avgRenderTime: avg(last10Render).toFixed(0) + 'ms',
      avgDOMNodes: avg(this.metrics.domNodeCount.map(m => m.count)).toFixed(0),
      totalAPICalls: this.metrics.apiCalls.length,
      totalRenders: this.metrics.renderTimes.length
    };
  }

  /**
   * Clear old metrics (keep only last 1000)
   */
  cleanup() {
    const maxLen = 1000;
    Object.keys(this.metrics).forEach(key => {
      if (this.metrics[key].length > maxLen) {
        this.metrics[key] = this.metrics[key].slice(-maxLen);
      }
    });
  }

  /**
   * Reset all metrics
   */
  reset() {
    Object.keys(this.metrics).forEach(key => {
      this.metrics[key] = [];
    });
  }
}

export const perfMonitor = new PerformanceMonitor();
