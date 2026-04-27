#!/bin/bash
set -e

echo "Building generator frontend..."
cd frontend
npm run build
cd ..

echo "Uploading generator to S3..."
GENERATOR_BUCKET="my-generator-frontend-${AWS_ACCOUNT_ID}"
aws s3 sync frontend/dist/ "s3://${GENERATOR_BUCKET}/" --delete

echo "Invalidating CloudFront cache for generator..."
GENERATOR_DIST_ID="${GENERATOR_CLOUDFRONT_ID}"
aws cloudfront create-invalidation --distribution-id "${GENERATOR_DIST_ID}" --paths "/*"

echo "✅ Generator UI deployed successfully!"
