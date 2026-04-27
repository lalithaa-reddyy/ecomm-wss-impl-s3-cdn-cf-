const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const parquet = require("parquetjs");

const s3 = new S3Client({});

/**
 * Define Parquet schema for events
 */
const eventSchema = new parquet.ParquetSchema({
  eventId: { type: "UTF8", optional: false },
  eventType: { type: "UTF8", optional: false },
  timestamp: { type: "UTF8", optional: false },
  productCategory: { type: "UTF8", optional: true },
  campaignId: { type: "UTF8", optional: true },
  deviceType: { type: "UTF8", optional: true },
  city: { type: "UTF8", optional: true },
  segment: { type: "UTF8", optional: true },
  ageGroup: { type: "UTF8", optional: true },
  isAnomaly: { type: "BOOLEAN", optional: true },
  anomalyType: { type: "UTF8", optional: true },
  orderValue: { type: "DOUBLE", optional: true },
});

/**
 * Define Parquet schema for aggregations
 */
const aggregationSchema = new parquet.ParquetSchema({
  id: { type: "UTF8", optional: false },
  total: { type: "INT64", optional: true },
  orders: { type: "INT64", optional: true },
  revenue: { type: "DOUBLE", optional: true },
  page_view: { type: "INT64", optional: true },
  product_view: { type: "INT64", optional: true },
  add_to_cart: { type: "INT64", optional: true },
  order: { type: "INT64", optional: true },
  wishlist_add: { type: "INT64", optional: true },
  lastSeen: { type: "UTF8", optional: true },
  createdAt: { type: "UTF8", optional: true },
});

/**
 * Write events to S3 in Parquet format
 * @param {Array} records - Array of event records
 * @param {string} bucket - S3 bucket name
 * @param {string} prefix - S3 prefix/folder path
 * @param {string} filename - Filename (without .parquet extension)
 * @returns {Promise<Object>} - Upload result with S3 key and size
 */
async function writeEventsToParquet(records, bucket, prefix, filename) {
  if (!bucket) throw new Error("Bucket name is required");
  if (!records || records.length === 0) throw new Error("Records array cannot be empty");

  const tmpFile = `/tmp/${filename}.parquet`;

  try {
    // Create writer
    const writer = await parquet.ParquetWriter.openFile(eventSchema, tmpFile);

    // Write records
    for (const record of records) {
      await writer.appendRow(record);
    }

    // Close writer
    await writer.close();

    // Read file buffer
    const fileBuffer = fs.readFileSync(tmpFile);

    // Upload to S3
    const s3Key = `${prefix}/${filename}.parquet`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: "application/octet-stream",
        Metadata: {
          "original-format": "json",
          "conversion-timestamp": new Date().toISOString(),
          "record-count": records.length.toString(),
        },
      })
    );

    console.log(`✅ Uploaded events to S3: s3://${bucket}/${s3Key} (${fileBuffer.length} bytes)`);

    return {
      success: true,
      bucket,
      key: s3Key,
      size: fileBuffer.length,
      records: records.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`❌ Failed to write events to Parquet: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    // Don't throw - return error result instead
    return {
      success: false,
      error: error.message,
      bucket,
      timestamp: new Date().toISOString()
    };
  } finally {
    // Cleanup temp file
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}

/**
 * Write aggregations to S3 in Parquet format
 * @param {Array} records - Array of aggregation records {id, ...counters}
 * @param {string} bucket - S3 bucket name
 * @param {string} prefix - S3 prefix/folder path
 * @param {string} filename - Filename (without .parquet extension)
 * @returns {Promise<Object>} - Upload result
 */
async function writeAggregationsToParquet(records, bucket, prefix, filename) {
  if (!bucket) throw new Error("Bucket name is required");
  if (!records || records.length === 0) throw new Error("Records array cannot be empty");

  const tmpFile = `/tmp/${filename}-agg.parquet`;

  try {
    // Create writer
    const writer = await parquet.ParquetWriter.openFile(aggregationSchema, tmpFile);

    // Write records
    for (const record of records) {
      // Ensure all numeric fields are present as integers
      const normalizedRecord = {
        id: record.id,
        total: record.total || 0,
        orders: record.orders || 0,
        revenue: record.revenue || 0,
        page_view: record.page_view || 0,
        product_view: record.product_view || 0,
        add_to_cart: record.add_to_cart || 0,
        order: record.order || 0,
        wishlist_add: record.wishlist_add || 0,
        lastSeen: record.lastSeen || new Date().toISOString(),
        createdAt: record.createdAt || new Date().toISOString(),
      };
      await writer.appendRow(normalizedRecord);
    }

    // Close writer
    await writer.close();

    // Read file buffer
    const fileBuffer = fs.readFileSync(tmpFile);

    // Upload to S3
    const s3Key = `${prefix}/${filename}-aggregations.parquet`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: "application/octet-stream",
        Metadata: {
          "data-type": "aggregations",
          "conversion-timestamp": new Date().toISOString(),
          "record-count": records.length.toString(),
        },
      })
    );

    console.log(
      `✅ Uploaded aggregations to S3: s3://${bucket}/${s3Key} (${fileBuffer.length} bytes)`
    );

    return {
      success: true,
      bucket,
      key: s3Key,
      size: fileBuffer.length,
      records: records.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`❌ Failed to write aggregations to Parquet: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    // Don't throw - return error result instead
    return {
      success: false,
      error: error.message,
      bucket,
      timestamp: new Date().toISOString()
    };
  } finally {
    // Cleanup temp file
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}

/**
 * Batch write multiple datasets to S3 in Parquet format
 * Useful for writing all aggregations in parallel
 */
async function writeBatchToParquet(datasets, bucket) {
  if (!bucket) throw new Error("Bucket name is required");
  if (!datasets || datasets.length === 0) throw new Error("Datasets array cannot be empty");

  const uploadPromises = datasets.map((dataset) => {
    const { records, prefix, filename, type = "events" } = dataset;

    if (type === "aggregations") {
      return writeAggregationsToParquet(records, bucket, prefix, filename);
    } else {
      return writeEventsToParquet(records, bucket, prefix, filename);
    }
  });

  try {
    const results = await Promise.all(uploadPromises);
    console.log(`✅ Successfully uploaded ${results.length} Parquet files to S3`);
    return results;
  } catch (error) {
    console.error(`❌ Batch upload failed: ${error.message}`);
    throw error;
  }
}

module.exports = {
  writeEventsToParquet,
  writeAggregationsToParquet,
  writeBatchToParquet,
  eventSchema,
  aggregationSchema,
};
