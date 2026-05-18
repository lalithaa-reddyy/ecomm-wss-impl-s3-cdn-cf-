# Cache Clearing Commands

## 🚀 One-Command Solution (Easiest)

Run this to clear ALL caches:
```powershell
.\clear-cache.ps1
```

This clears:
- ✅ CloudFront CDN cache (both frontends)
- ✅ Browser HTTP cache (Chrome, Firefox, Edge)
- ✅ Windows DNS cache
- ✅ Shows instructions for clearing localStorage

---

## 📝 Individual Commands (If You Need Specific Cache Clearing)

### 1. Clear CloudFront Cache (CDN)

**Get your Distribution IDs:**
```bash
# Get stack name first
$STACK_NAME = (Get-Content samconfig.toml | Select-String "stack_name" | Select-Object -First 1) -replace '.*stack_name\s*=\s*"' -replace '".*'

# Get Distribution IDs
aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' --output text

aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs[?OutputKey==`DashboardCloudFrontDistributionId`].OutputValue' --output text
```

**Invalidate CloudFront:**
```bash
# Generator Frontend
aws cloudfront create-invalidation --distribution-id [GENERATOR-DIST-ID] --paths "/*" --no-cli-pager

# Dashboard Frontend
aws cloudfront create-invalidation --distribution-id [DASHBOARD-DIST-ID] --paths "/*" --no-cli-pager
```

---

### 2. Clear Browser Cache (Local Machine)

**Chrome:**
```powershell
# Close Chrome first!
$chromeCachePath = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $chromeCachePath
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Code Cache"
```

**Firefox:**
```powershell
# Close Firefox first!
$firefoxPath = "$env:LOCALAPPDATA\Mozilla\Firefox\Profiles"
Get-ChildItem $firefoxPath -Filter "*.default*" | ForEach-Object {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $_.FullName "cache2")
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $_.FullName "OfflineCache")
}
```

**Microsoft Edge:**
```powershell
# Close Edge first!
$edgeCachePath = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $edgeCachePath
```

---

### 3. Clear Browser Storage (localStorage, sessionStorage)

**In Browser DevTools Console (F12):**
```javascript
// Clear all storage
localStorage.clear();
sessionStorage.clear();

// Clear Cognito cache
try {
    indexedDB.deleteDatabase('aws.cognito');
} catch(e) {
    console.log('Could not clear IndexedDB');
}

// Reload page
location.reload();
```

**Or in PowerShell (opens browser with script):**
```powershell
# This creates a bookmark that clears cache when clicked
$script = @"
javascript:localStorage.clear();sessionStorage.clear();location.reload();
"@
Write-Host "Bookmark this URL in your browser:"
Write-Host $script
```

---

### 4. Clear DNS Cache (System Level)

**PowerShell (requires admin):**
```powershell
# Clear Windows DNS cache
Clear-DnsClientCache

# Flush DNS via cmd (alternative)
ipconfig /flushdns
```

**Command Prompt (requires admin):**
```cmd
ipconfig /flushdns
```

---

### 5. Clear S3 Cache (if files aren't updating)

**Reupload to S3 (already handled by deploy script):**
```bash
# Generator Frontend
aws s3 sync frontend/dist/ s3://my-generator-frontend-[ACCOUNT]/ --delete

# Dashboard Frontend
aws s3 sync dashboard-frontend/dist/ s3://my-dashboard-frontend-[ACCOUNT]/ --delete
```

---

## 🔄 Complete Cache Clear Workflow

```powershell
# Step 1: Clear CloudFront
.\clear-cache.ps1

# Step 2: Wait 30 seconds for CloudFront propagation
Start-Sleep -Seconds 30

# Step 3: Open browser and run in Console (F12)
# localStorage.clear(); sessionStorage.clear(); location.reload();

# Step 4: Hard refresh 3 times
# Ctrl+Shift+R (3 times)

# Step 5: Verify in console
# Should see: 📡 WebSocket Endpoint: wss://[NEW-ID]...
# Should see: [API] Calling https://[NEW-ID]...
```

---

## ✅ How to Know Cache is Cleared

**After clearing, check console for:**

✅ **WebSocket Endpoint (Dashboard):**
```
📡 WebSocket Endpoint: wss://[NEW-ID].execute-api.us-east-1.amazonaws.com/prod
WebSocket connected
```

✅ **API Endpoint (Frontend):**
```
[API] Calling https://[NEW-ID].execute-api.us-east-1.amazonaws.com/prod/generate
```

✅ **Cognito Client ID:**
```
Login attempt with Client ID: [NEW-ID]
```

❌ **If still seeing old IDs = Cache not cleared properly**

---

## 🛠️ Troubleshooting

### "CloudFront invalidation taking too long?"
```bash
# Check invalidation status
aws cloudfront list-invalidations --distribution-id [DIST-ID]

# Or wait 2-3 minutes for propagation
```

### "Browser still showing old content?"
```powershell
# Option 1: Open Incognito/Private window
# - Don't have old cache

# Option 2: Restart browser completely
# Close all instances and reopen

# Option 3: Manually delete browser cache
.\clear-cache.ps1
```

### "WebSocket still connecting to old endpoint?"
```javascript
// Check what endpoint app is using
console.log(import.meta.env.VITE_WS_ENDPOINT)

// If wrong, the .env file wasn't updated before build
// Need to rebuild:
```

```powershell
# Rebuild and redeploy
.\deploy-all.ps1
```

---

## Summary

| Cache Type | Clear Method | Urgency |
|------------|--------------|---------|
| CloudFront | `./clear-cache.ps1` | HIGH - Must do after deploy |
| Browser HTTP | `./clear-cache.ps1` | HIGH - Must do after CloudFront |
| localStorage | Browser console | MEDIUM - Do after hard refresh |
| IndexedDB | Browser console | MEDIUM - Clears Cognito cache |
| DNS | System (optional) | LOW - Only if issues persist |

