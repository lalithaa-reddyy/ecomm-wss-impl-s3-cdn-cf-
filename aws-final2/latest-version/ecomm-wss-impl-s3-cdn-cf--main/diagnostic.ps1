# Diagnostic script to check pipeline status
Write-Host "`n📊 === PIPELINE STATUS ===`n" -ForegroundColor Cyan

# 1. Check generator state
Write-Host "1️⃣ GENERATOR STATE:" -ForegroundColor Yellow
try {
    $state = aws dynamodb get-item --table-name event-generator-state --key '{"generatorId":{"S":"default"}}' --output json | ConvertFrom-Json
    if ($state.Item) {
        Write-Host "   Status: $($state.Item.status.S)" -ForegroundColor Green
        Write-Host "   Rate: $($state.Item.rate.N)"
        Write-Host "   Started: $($state.Item.startTime.S)"
        Write-Host "   Last Updated: $($state.Item.lastUpdated.S)"
    } else {
        Write-Host "   No state found - generator hasn't run yet" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Error: $_" -ForegroundColor Red
}

# 2. Check Kinesis stream
Write-Host "`n2️⃣ KINESIS STREAM:" -ForegroundColor Yellow
try {
    $shards = aws kinesis list-shards --stream-name event-stream-pipeline --output json | ConvertFrom-Json
    Write-Host "   Number of shards: $($shards.Shards.Count)" -ForegroundColor Green
    
    if ($shards.Shards.Count -gt 0) {
        $shardId = $shards.Shards[0].ShardId
        Write-Host "   Checking shard: $shardId"
        
        $iterator = aws kinesis get-shard-iterator --stream-name event-stream-pipeline --shard-id $shardId --shard-iterator-type LATEST --output json | ConvertFrom-Json
        $records = aws kinesis get-records --shard-iterator $iterator.ShardIterator --output json | ConvertFrom-Json
        
        $recordCount = $records.Records.Count
        Write-Host "   Records in stream: $recordCount" -ForegroundColor Green
        if ($recordCount -gt 0) {
            Write-Host "   First record timestamp: $($records.Records[0].ApproximateArrivalTimestamp)" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

# 3. Check DynamoDB aggregations
Write-Host "`n3️⃣ DYNAMODB AGGREGATIONS:" -ForegroundColor Yellow
try {
    $scan = aws dynamodb scan --table-name event-stream-aggregations --max-items 5 --output json | ConvertFrom-Json
    Write-Host "   Items returned: $($scan.Items.Count)" -ForegroundColor Green
    Write-Host "   Scanned: $($scan.ScannedCount)" -ForegroundColor Green
    if ($scan.Items.Count -gt 0) {
        Write-Host "   Sample IDs:" -ForegroundColor Green
        $scan.Items | ForEach-Object { Write-Host "     - $($_.id.S)" }
    }
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host "`n✅ Status check complete`n" -ForegroundColor Cyan
