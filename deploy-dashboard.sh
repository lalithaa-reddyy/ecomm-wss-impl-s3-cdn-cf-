#!/bin/bash
set -e

echo "Building dashboard frontend..."
cd dashboard-frontend
npm run build
cd ..

echo "Uploading dashboard to S3..."
DASHBOARD_BUCKET="my-dashboard-frontend-lal11"
aws s3 sync dashboard-frontend/dist/ "s3://${DASHBOARD_BUCKET}/" --delete

echo "Invalidating CloudFront cache for dashboard..."
DASHBOARD_DIST_ID="EE2B3SX6PR14M"
aws cloudfront create-invalidation --distribution-id "${DASHBOARD_DIST_ID}" --paths "/*"

echo "✅ Dashboard deployed successfully!"
echo "Access at: https://d$(aws cloudfront get-distribution --id ${DASHBOARD_DIST_ID} --query 'Distribution.DomainName' --output text)"
