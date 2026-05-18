#!/usr/bin/env pwsh
# Complete Cache Clearing Script

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "COMPLETE CACHE CLEARING" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host "`nStep 1: Getting CloudFront Distribution IDs..." -ForegroundColor Blue
$samConfig = Get-Content samconfig.toml | Select-String "stack_name" | Select-Object -First 1
$STACK_NAME = $samConfig -replace '.*stack_name\s*=\s*"' -replace '".*'
Write-Host "Stack name: $STACK_NAME"

$GENERATOR_DIST_ID = aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' --output text --no-cli-pager
$DASHBOARD_DIST_ID = aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`DashboardCloudFrontDistributionId`].OutputValue' --output text --no-cli-pager

Write-Host "  Generator Dist ID: $GENERATOR_DIST_ID"
Write-Host "  Dashboard Dist ID: $DASHBOARD_DIST_ID"

Write-Host "`nStep 2: Invalidating CloudFront Caches..." -ForegroundColor Blue

if ($GENERATOR_DIST_ID) {
    Write-Host "  Invalidating Generator CloudFront..."
    aws cloudfront create-invalidation --distribution-id $GENERATOR_DIST_ID --paths "/*" --no-cli-pager | Out-Null
    Write-Host "  OK Generator CloudFront invalidated"
}

if ($DASHBOARD_DIST_ID) {
    Write-Host "  Invalidating Dashboard CloudFront..."
    aws cloudfront create-invalidation --distribution-id $DASHBOARD_DIST_ID --paths "/*" --no-cli-pager | Out-Null
    Write-Host "  OK Dashboard CloudFront invalidated"
}

Write-Host "`nStep 3: Clearing Browser Caches..." -ForegroundColor Blue

$chromeCachePath = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"
$chromeCodeCachePath = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Code Cache"

if (Test-Path $chromeCachePath) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $chromeCachePath
    Write-Host "  OK Chrome cache cleared"
}

if (Test-Path $chromeCodeCachePath) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $chromeCodeCachePath
}

$firefoxCachePath = "$env:LOCALAPPDATA\Mozilla\Firefox\Profiles"
if (Test-Path $firefoxCachePath) {
    Get-ChildItem $firefoxCachePath -Filter "*.default*" -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $_.FullName "cache2")
    }
    Write-Host "  OK Firefox cache cleared"
}

$edgeCachePath = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache"
if (Test-Path $edgeCachePath) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $edgeCachePath
    Write-Host "  OK Edge cache cleared"
}

Write-Host "`nStep 4: Clearing Windows DNS Cache..." -ForegroundColor Blue
try {
    Clear-DnsClientCache -ErrorAction Stop
    Write-Host "  OK DNS cache cleared"
} catch {
    Write-Host "  ! DNS cache clear failed (may need admin)"
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "CACHE CLEARING COMPLETE" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Open browser DevTools (F12)"
Write-Host "  2. Go to Console tab"
Write-Host "  3. Run these commands:"
Write-Host "     localStorage.clear()"
Write-Host "     sessionStorage.clear()"
Write-Host "     location.reload()"
Write-Host "  4. Hard refresh (Ctrl+Shift+R) 3 times"
Write-Host "  5. Check console for NEW endpoints"

Write-Host "`n=========================================="
