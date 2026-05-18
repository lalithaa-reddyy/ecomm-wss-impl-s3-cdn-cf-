#!/bin/bash
set -e

echo "Building dashboard frontend..."
cd dashboard-frontend
npm run build
cd ..

echo "Uploading dashboard to S3..."
DASHBOARD_BUCKET="my-dashboard-frontend-lal11"

echo "Uploading index.html with no-cache headers..."
aws s3 cp dashboard-frontend/dist/index.html "s3://${DASHBOARD_BUCKET}/index.html" \
  --cache-control "no-cache, max-age=0" \
  --content-type "text/html"

echo "Uploading static assets with long cache..."
aws s3 sync dashboard-frontend/dist/ "s3://${DASHBOARD_BUCKET}/" \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"

echo "Invalidating CloudFront cache for dashboard..."
DASHBOARD_DIST_ID="EE2B3SX6PR14M"
aws cloudfront create-invalidation --distribution-id "${DASHBOARD_DIST_ID}" --paths "/"

echo "✅ Dashboard deployed successfully!"
echo "Access at: https://d$(aws cloudfront get-distribution --id ${DASHBOARD_DIST_ID} --query 'Distribution.DomainName' --output text)"
