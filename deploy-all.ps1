#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Full Pipeline Deployment Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$env:AWS_PAGER = ""

Write-Host "`nStep 1: SAM Build..." -ForegroundColor Blue
try {
    sam build
    Write-Host "  OK Build complete"
} catch {
    Write-Host "  ERROR: Sam build failed" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

Write-Host "`nStep 2: SAM Deploy..." -ForegroundColor Blue
try {
    sam deploy --no-confirm-changeset
    Write-Host "  OK Deploy complete"
} catch {
    Write-Host "  ERROR: SAM deploy failed" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

Write-Host "`nStep 3: Getting Stack Outputs..." -ForegroundColor Blue

$STACK_NAME = "event-stream-pipeline"
Write-Host "Stack name: $STACK_NAME"

Write-Host "Waiting for stack to be available..."
$maxRetries = 10
$retryCount = 0
$stackFound = $false

while ($retryCount -lt $maxRetries -and -not $stackFound) {
    $retryCount++
    Write-Host "  Attempt $retryCount/$maxRetries..."

    try {
        $stackOutput = aws cloudformation describe-stacks --stack-name $STACK_NAME --output json 2>&1
        $exitCode = $LASTEXITCODE
        Write-Host "    Exit code: $exitCode"
        Write-Host "    Output length: $($stackOutput.Length)"

        if ($exitCode -eq 0 -and $stackOutput -and $stackOutput.Length -gt 0) {
            Write-Host "  OK Stack found"
            $stackFound = $true
        } else {
            Write-Host "    Stack not ready yet, retrying..."
            if ($retryCount -lt $maxRetries) {
                Start-Sleep -Seconds 5
            }
        }
    } catch {
        Write-Host "    Exception: $($_.Exception.Message)"
        if ($retryCount -lt $maxRetries) {
            Start-Sleep -Seconds 5
        }
    }
}

if (-not $stackFound) {
    Write-Host "  ERROR: Stack not available after $maxRetries retries" -ForegroundColor Red
    exit 1
}

Write-Host "Fetching CloudFormation outputs..."
$outputs = aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs' --output json | ConvertFrom-Json

if (-not $outputs) {
    Write-Host "  ERROR: No outputs found from stack" -ForegroundColor Red
    exit 1
}

Write-Host "Available outputs:" -ForegroundColor Cyan
$outputs | ForEach-Object { Write-Host "  $($_.OutputKey): $($_.OutputValue)" }

$GENERATOR_BUCKET = (($outputs | Where-Object { $_.OutputKey -eq "FrontendBucketName" }).OutputValue).Trim()
$GENERATOR_DIST_ID = (($outputs | Where-Object { $_.OutputKey -eq "CloudFrontDistributionId" }).OutputValue).Trim()
$GENERATOR_DIST_DOMAIN = (($outputs | Where-Object { $_.OutputKey -eq "CloudFrontDomainName" }).OutputValue).Trim()
$DASHBOARD_BUCKET = (($outputs | Where-Object { $_.OutputKey -eq "DashboardBucketName" }).OutputValue).Trim()
$DASHBOARD_DIST_ID = (($outputs | Where-Object { $_.OutputKey -eq "DashboardCloudFrontDistributionId" }).OutputValue).Trim()
$DASHBOARD_DIST_DOMAIN = (($outputs | Where-Object { $_.OutputKey -eq "DashboardCloudFrontDomainName" }).OutputValue).Trim()
$WS_ENDPOINT = (($outputs | Where-Object { $_.OutputKey -eq "WebSocketEndpoint" }).OutputValue).Trim()
$API_ENDPOINT = (($outputs | Where-Object { $_.OutputKey -eq "EventApiEndpoint" }).OutputValue).Trim()
$COGNITO_USER_POOL_ID = (($outputs | Where-Object { $_.OutputKey -eq "CognitoUserPoolId" }).OutputValue).Trim()
$COGNITO_CLIENT_ID = (($outputs | Where-Object { $_.OutputKey -eq "CognitoClientId" }).OutputValue).Trim()

Write-Host "`nExtracted values:" -ForegroundColor Green
Write-Host "  API_ENDPOINT: $API_ENDPOINT"
Write-Host "  WS_ENDPOINT: $WS_ENDPOINT"
Write-Host "  COGNITO_USER_POOL_ID: $COGNITO_USER_POOL_ID"
Write-Host "  COGNITO_CLIENT_ID: $COGNITO_CLIENT_ID"

Write-Host "`nStep 4: Updating Frontend .env..." -ForegroundColor Blue

$frontendContent = @"
VITE_API_ENDPOINT=$API_ENDPOINT
VITE_COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID
VITE_COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID
VITE_COGNITO_REGION=us-east-1
"@

$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path "frontend" ".env"), $frontendContent, $utf8)
Write-Host "  OK frontend/.env"

Write-Host "`nStep 5: Updating Dashboard .env..." -ForegroundColor Blue

$dashboardContent = @"
VITE_WS_ENDPOINT=$WS_ENDPOINT
"@

[System.IO.File]::WriteAllText((Join-Path "dashboard-frontend" ".env"), $dashboardContent, $utf8)
Write-Host "  OK dashboard-frontend/.env"

Write-Host "`nStep 6: Building Frontend..." -ForegroundColor Blue
Push-Location frontend
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue node_modules
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue dist
Remove-Item -Force -ErrorAction SilentlyContinue package-lock.json
npm install
npm run build
Pop-Location
Write-Host "  OK Frontend built"

Write-Host "`nStep 7: Building Dashboard..." -ForegroundColor Blue
Push-Location dashboard-frontend
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue node_modules
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue dist
Remove-Item -Force -ErrorAction SilentlyContinue package-lock.json
npm install
npm run build
Pop-Location
Write-Host "  OK Dashboard built"

Write-Host "`nStep 8: Deploying Frontend..." -ForegroundColor Blue
if ($GENERATOR_BUCKET -and $GENERATOR_DIST_ID) {
    aws s3 sync frontend/dist/ "s3://$GENERATOR_BUCKET/" --delete | Out-Null
    aws cloudfront create-invalidation --distribution-id $GENERATOR_DIST_ID --paths "/*" | Out-Null
    Write-Host "  OK Frontend deployed"
} else {
    Write-Host "  ERROR Missing bucket or dist ID" -ForegroundColor Red
}

Write-Host "`nStep 9: Deploying Dashboard..." -ForegroundColor Blue
if ($DASHBOARD_BUCKET -and $DASHBOARD_DIST_ID) {
    aws s3 sync dashboard-frontend/dist/ "s3://$DASHBOARD_BUCKET/" --delete | Out-Null
    aws cloudfront create-invalidation --distribution-id $DASHBOARD_DIST_ID --paths "/*" | Out-Null
    Write-Host "  OK Dashboard deployed"
} else {
    Write-Host "  ERROR Missing bucket or dist ID" -ForegroundColor Red
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "DEPLOYMENT COMPLETE" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

Write-Host "`nBackend Endpoints:" -ForegroundColor Yellow
Write-Host "  API: $API_ENDPOINT"
Write-Host "  WebSocket: $WS_ENDPOINT"

Write-Host "`nCognito:" -ForegroundColor Yellow
Write-Host "  User Pool: $COGNITO_USER_POOL_ID"
Write-Host "  Client ID: $COGNITO_CLIENT_ID"

Write-Host "`nFrontend URLs:" -ForegroundColor Yellow
if ($GENERATOR_DIST_DOMAIN) {
    Write-Host "  Generator: https://$GENERATOR_DIST_DOMAIN"
}
if ($DASHBOARD_DIST_DOMAIN) {
    Write-Host "  Dashboard: https://$DASHBOARD_DIST_DOMAIN"
}

Write-Host "`nNext: Clear cache and refresh browser"
Write-Host "  Run: .\clear-cache.ps1"
Write-Host "`n=========================================="
