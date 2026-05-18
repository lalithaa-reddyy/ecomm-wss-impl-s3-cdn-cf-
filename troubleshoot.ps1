# Troublu Troubleshoot Event Stream Data Flow
# Usage: PowerShell .\troubleshoot.ps1

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    Event Stream Troubleshooting - NO DATA IN TABLE             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Get AWS Account
$Account = aws sts get-caller-identity --query 'Account' --output text
$Region = aws configure get region

Write-Host "AWS Account: $Account" -ForegroundColor Green
Write-Host "AWS Region: $Region" -ForegroundColor Green
Write-Host ""

# Get Stack Outputs
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  Stack Outputs                                                 ║" -ForegroundColor Yellow
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow

$Table = aws cloudformation describe-stacks `
  --stack-name event-stream-pipeline `
  --query 'Stacks[0].Outputs[?OutputKey==`AggregationTableName`].OutputValue' `
  --output text 2>$null

$Stream = aws cloudformation describe-stacks `
  --stack-name event-stream-pipeline `
  --query 'Stacks[0].Outputs[?OutputKey==`EventStreamName`].OutputValue' `
  --output text 2>$null

$API = aws cloudformation describe-stacks `
  --stack-name event-stream-pipeline `
  --query 'Stacks[0].Outputs[?OutputKey==`EventApiEndpoint`].OutputValue' `
  --output text 2>$null

Write-Host "✅ DynamoDB Table: $Table" -ForegroundColor Green
Write-Host "✅ Kinesis Stream: $Stream" -ForegroundColor Green
Write-Host "✅ API Endpoint: $API" -ForegroundColor Green
Write-Host ""

# Check DynamoDB Item Count
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  DynamoDB Table Check                                          ║" -ForegroundColor Yellow
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow

$ItemCount = aws dynamodb scan --table-name $Table --select COUNT --output text | Select-Object -Last 1

Write-Host "Items in DynamoDB Table: $ItemCount" -ForegroundColor Cyan
Write-Host ""

if ($ItemCount -gt 0) {
  Write-Host "✅ TABLE HAS DATA!" -ForegroundColor Green
  Write-Host ""
  Write-Host "Showing first 5 items:" -ForegroundColor Yellow
  aws dynamodb scan --table-name $Table --limit 5 | ConvertFrom-Json | ConvertTo-Json -Depth 10
} else {
  Write-Host "❌ TABLE IS EMPTY!" -ForegroundColor Red
  Write-Host ""
  Write-Host "This could mean:"
  Write-Host "  1. Events haven't been generated yet"
  Write-Host "  2. Event generator is not sending to Kinesis"
  Write-Host "  3. Aggregator Lambda is not processing Kinesis events"
  Write-Host "  4. Lambda has no permission to write to DynamoDB"
}

Write-Host ""

# Check Kinesis Stream
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  Kinesis Stream Check                                          ║" -ForegroundColor Yellow
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow

$StreamDesc = aws kinesis describe-stream --stream-name $Stream --output json | ConvertFrom-Json
$Status = $StreamDesc.StreamDescription.StreamStatus
$Shards = $StreamDesc.StreamDescription.Shards.Count

Write-Host "Stream Status: $Status" -ForegroundColor Green
Write-Host "Shard Count: $Shards" -ForegroundColor Green
Write-Host ""

# Check Recent Lambda Logs
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  Recent Lambda Logs                                            ║" -ForegroundColor Yellow
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow

$GenLogGroup = "/aws/lambda/event-stream-pipeline-EventGeneratorFunction"
Write-Host ""
Write-Host "🔸 Generator Function Logs:" -ForegroundColor Cyan
aws logs tail $GenLogGroup --follow $false --max-items 5 2>$null | Select-Object -Last 5

Write-Host ""
Write-Host "🔸 Aggregator Function Logs:" -ForegroundColor Cyan
$AggLogGroup = "/aws/lambda/event-stream-pipeline-AggregatorFunction"
aws logs tail $AggLogGroup --follow $false --max-items 5 2>$null | Select-Object -Last 5

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  Troubleshooting Complete                                      ║" -ForegroundColor Yellow
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""
