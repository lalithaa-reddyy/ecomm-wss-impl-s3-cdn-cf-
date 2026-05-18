#!/bin/bash
set -e

echo "=========================================="
echo "Full Pipeline Deployment Script"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: SAM Build and Deploy
echo -e "${BLUE}Step 1: SAM Build and Deploy${NC}"
echo "Building SAM template..."
sam build

echo "Deploying SAM stack..."
sam deploy --no-confirm-changeset

# Step 2: Capture outputs from SAM deployment
echo -e "${BLUE}Step 2: Capturing SAM outputs...${NC}"

# Get stack outputs
STACK_NAME=$(grep "stack_name" samconfig.toml | head -1 | sed 's/.*= "//' | sed 's/".*//')
echo "Stack name: $STACK_NAME"

# Extract outputs from CloudFormation
GENERATOR_BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`GeneratorBucketName`].OutputValue' --output text 2>/dev/null || echo "")
GENERATOR_DIST_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`GeneratorDistributionId`].OutputValue' --output text 2>/dev/null || echo "")
DASHBOARD_BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`DashboardBucketName`].OutputValue' --output text 2>/dev/null || echo "")
DASHBOARD_DIST_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`DashboardDistributionId`].OutputValue' --output text 2>/dev/null || echo "")
WS_ENDPOINT=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`WebSocketEndpoint`].OutputValue' --output text 2>/dev/null || echo "")
API_ENDPOINT=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text 2>/dev/null || echo "")
COGNITO_USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' --output text 2>/dev/null || echo "")
COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`CognitoClientId`].OutputValue' --output text 2>/dev/null || echo "")

echo -e "${GREEN}Captured outputs:${NC}"
echo "  Generator Bucket: $GENERATOR_BUCKET"
echo "  Generator Dist ID: $GENERATOR_DIST_ID"
echo "  Dashboard Bucket: $DASHBOARD_BUCKET"
echo "  Dashboard Dist ID: $DASHBOARD_DIST_ID"
echo "  API Endpoint: $API_ENDPOINT"
echo "  WebSocket Endpoint: $WS_ENDPOINT"
echo "  Cognito User Pool ID: $COGNITO_USER_POOL_ID"
echo "  Cognito Client ID: $COGNITO_CLIENT_ID"

# Step 3: Update environment files for Frontend
echo -e "${BLUE}Step 3: Updating Frontend environment files...${NC}"

cat > frontend/.env << EOF
VITE_API_ENDPOINT=$API_ENDPOINT
VITE_COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID
VITE_COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
VITE_COGNITO_REGION=us-east-1
EOF

cp frontend/.env frontend/.env.production
echo -e "${GREEN}Frontend .env and .env.production updated${NC}"

# Step 4: Update environment files for Dashboard Frontend
echo -e "${BLUE}Step 4: Updating Dashboard Frontend environment files...${NC}"

cat > dashboard-frontend/.env << EOF
VITE_WS_ENDPOINT=$WS_ENDPOINT
EOF

cp dashboard-frontend/.env dashboard-frontend/.env.production
echo -e "${GREEN}Dashboard Frontend .env and .env.production updated${NC}"

# Step 5: Build Frontend
echo -e "${BLUE}Step 5: Building Frontend...${NC}"
cd frontend
echo "Cleaning frontend..."
rm -rf node_modules dist
rm -f package-lock.json
echo "Installing dependencies..."
npm install
echo "Building..."
npm run build
cd ..

echo -e "${GREEN}Frontend built${NC}"

# Step 6: Build Dashboard Frontend
echo -e "${BLUE}Step 6: Building Dashboard Frontend...${NC}"
cd dashboard-frontend
echo "Cleaning dashboard-frontend..."
rm -rf node_modules dist
rm -f package-lock.json
echo "Installing dependencies..."
npm install
echo "Building..."
npm run build
cd ..

echo -e "${GREEN}Dashboard Frontend built${NC}"

# Step 7: Deploy Frontend to S3 and CloudFront
if [ ! -z "$GENERATOR_BUCKET" ] && [ ! -z "$GENERATOR_DIST_ID" ]; then
  echo -e "${BLUE}Step 7a: Deploying Frontend to S3...${NC}"
  aws s3 sync frontend/dist/ "s3://${GENERATOR_BUCKET}/" --delete

  echo -e "${BLUE}Step 7b: Invalidating Frontend CloudFront...${NC}"
  aws cloudfront create-invalidation --distribution-id "${GENERATOR_DIST_ID}" --paths "/*"
  echo -e "${GREEN}Frontend deployed${NC}"
else
  echo -e "${YELLOW}Warning: Could not get Generator bucket/distribution ID from SAM outputs${NC}"
fi

# Step 8: Deploy Dashboard Frontend to S3 and CloudFront
if [ ! -z "$DASHBOARD_BUCKET" ] && [ ! -z "$DASHBOARD_DIST_ID" ]; then
  echo -e "${BLUE}Step 8a: Deploying Dashboard Frontend to S3...${NC}"
  aws s3 sync dashboard-frontend/dist/ "s3://${DASHBOARD_BUCKET}/" --delete

  echo -e "${BLUE}Step 8b: Invalidating Dashboard CloudFront...${NC}"
  aws cloudfront create-invalidation --distribution-id "${DASHBOARD_DIST_ID}" --paths "/*"
  echo -e "${GREEN}Dashboard Frontend deployed${NC}"
else
  echo -e "${YELLOW}Warning: Could not get Dashboard bucket/distribution ID from SAM outputs${NC}"
fi

# Step 9: Summary
echo ""
echo "=========================================="
echo -e "${GREEN}✅ Full Pipeline Deployment Complete!${NC}"
echo "=========================================="
echo ""
echo "Deployed Endpoints:"
echo "  API: $API_ENDPOINT"
echo "  WebSocket: $WS_ENDPOINT"
echo "  Cognito User Pool: $COGNITO_USER_POOL_ID"
echo "  Cognito Client: $COGNITO_CLIENT_ID"
echo ""
echo "To get the actual frontend URLs, run:"
echo "  aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs'"
echo ""
