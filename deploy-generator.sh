#!/bin/bash
set -e

echo "Building generator frontend..."
cd frontend
npm run build
cd ..

echo "Uploading generator to S3..."
GENERATOR_BUCKET="my-generator-frontend-${AWS_ACCOUNT_ID}"

echo "Uploading index.html with no-cache headers..."
aws s3 cp frontend/dist/index.html "s3://${GENERATOR_BUCKET}/index.html" \
  --cache-control "no-cache, max-age=0" \
  --content-type "text/html"

echo "Uploading static assets with long cache..."
aws s3 sync frontend/dist/ "s3://${GENERATOR_BUCKET}/" \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"

echo "Invalidating CloudFront cache for generator..."
GENERATOR_DIST_ID="${GENERATOR_CLOUDFRONT_ID}"
aws cloudfront create-invalidation --distribution-id "${GENERATOR_DIST_ID}" --paths "/"

echo "✅ Generator UI deployed successfully!"
