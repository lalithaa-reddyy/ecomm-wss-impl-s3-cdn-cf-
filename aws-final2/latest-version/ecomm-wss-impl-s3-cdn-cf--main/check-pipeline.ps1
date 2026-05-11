#!/usr/bin/env pwsh
# Simple diagnostic script

Write-Host "`nPIPELINE STATUS CHECK`n" -ForegroundColor Cyan

# 1. Generator state
Write-Host "1. Generator State:" -ForegroundColor Yellow
$genState = aws dynamodb get-item --table-name event-generator-state --key '{\"generatorId\":{\"S\":\"default\"}}' --output json 2>$null | ConvertFrom-Json
if ($genState.Item -and $genState.Item.status) {
    Write-Host "   Status: $($genState.Item.status.S)"
    Write-Host "   Rate: $($genState.Item.rate.N) events/min"
    Write-Host "   Started: $($genState.Item.startTime.S)"
} else {
    Write-Host "   No active generation" -ForegroundColor Yellow
}

# 2. Kinesis stream
Write-Host "`n2. Kinesis Stream:" -ForegroundColor Yellow
$shards = aws kinesis list-shards --stream-name event-stream-pipeline --output json 2>$null | ConvertFrom-Json
if ($shards.Shards) {
    $shardId = $shards.Shards[0].ShardId
    $iter = aws kinesis get-shard-iterator --stream-name event-stream-pipeline --shard-id $shardId --shard-iterator-type LATEST --output text 2>$null
    $recs = aws kinesis get-records --shard-iterator $iter --output json 2>$null | ConvertFrom-Json
    $count = $recs.Records.Count
    Write-Host "   Records in stream: $count"
    if ($count -gt 0) {
        Write-Host "   Sample: $($recs.Records[0].Data.substring(0, 50))..." -ForegroundColor Green
    }
}

# 3. DynamoDB aggregations
Write-Host "`n3. DynamoDB Aggregations:" -ForegroundColor Yellow
$agg = aws dynamodb scan --table-name event-stream-aggregations --limit 5 --output json 2>$null | ConvertFrom-Json
if ($agg.Items) {
    Write-Host "   Items found: $($agg.Count)"
    if ($agg.Count -gt 0) {
        Write-Host "   Sample items:"
        $agg.Items | Select-Object -First 3 | ForEach-Object { Write-Host "     - $($_.id.S)" }
    }
} else {
    Write-Host "   No items in aggregations table" -ForegroundColor Yellow
}

Write-Host "`nDone`n" -ForegroundColor Green
