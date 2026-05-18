# Deployment Verification Checklist

## Pre-Deployment: Verify Environment Files

### 1. Check .env files have CORRECT credentials
```bash
# Frontend
cat frontend/.env
# Should show:
# VITE_API_ENDPOINT=https://[CORRECT-ID].execute-api.us-east-1.amazonaws.com/prod
# VITE_COGNITO_USER_POOL_ID=us-east-1_[CORRECT-ID]
# VITE_COGNITO_CLIENT_ID=[CORRECT-ID]

# Dashboard
cat dashboard-frontend/.env
# Should show:
# VITE_WS_ENDPOINT=wss://[CORRECT-ID].execute-api.us-east-1.amazonaws.com/prod
```

### 2. Verify encoding is UTF-8 (no spaces between characters)
```bash
file frontend/.env
file dashboard-frontend/.env
# Should output: "ASCII text" or "UTF-8 Unicode text"
# NOT "Unicode text, UTF-16"
```

### 3. No .env.production files should exist
```bash
ls frontend/.env.production  # Should NOT exist
ls dashboard-frontend/.env.production  # Should NOT exist
```

---

## Deployment: Run Script
```powershell
.\deploy-all.ps1
```

Watch for:
- ✅ `Available outputs:` section should show YOUR new credentials
- ✅ `Extracted values:` should show NEW endpoints/IDs
- ✅ Both frontends should build successfully
- ✅ CloudFront invalidation should complete

---

## Post-Deployment: Browser Verification

### Step 1: Hard Clear All Caches

**Open DevTools (F12) and run in Console:**
```javascript
// Clear all caches
localStorage.clear()
sessionStorage.clear()
indexedDB.deleteDatabase('aws.cognito')
location.reload()
```

Then **hard refresh 3 times:**
- Windows/Linux: `Ctrl+Shift+R` (3 times)
- Mac: `Cmd+Shift+R` (3 times)

### Step 2: Check Console Logs

**Look for these messages:**

✅ **Frontend (Generator):**
```
[API] Calling https://[NEW-ID].execute-api.us-east-1.amazonaws.com/prod/generate
```

✅ **Dashboard:**
```
📡 WebSocket Endpoint: wss://[NEW-ID].execute-api.us-east-1.amazonaws.com/prod
WebSocket connected - waiting for server push
```

❌ **If you see OLD endpoints, the cache wasn't cleared properly**

---

## Validation Tests

### Test 1: Cognito Client ID Changed
```
1. Open Frontend (Generator)
2. Try to login with test user
3. Should use NEW Cognito Client ID
4. Check Console: [API] Calling [NEW-API]...
5. Should NOT see old API endpoint
```

### Test 2: WebSocket Endpoint Changed
```
1. Open Dashboard
2. Check Console: 📡 WebSocket Endpoint: wss://[NEW-ID]...
3. Should connect to NEW endpoint
4. Metrics should start flowing
5. Should NOT see old WebSocket endpoint errors
```

### Test 3: Status Persistence (Fix Verification)
```
1. Frontend: Click "Start Stream"
2. Status should show "Running"
3. Minimize browser
4. Maximize browser
5. Status should STILL show "Running" (not "Stopped")
6. Refresh page (F5)
7. Status should STILL show "Running"
```

### Test 4: CloudFront Cache Busting
```
1. Check Network tab (F12)
2. Look for requests to CloudFront
3. Response headers should show:
   - Content-Type: application/javascript
   - Cache-Control: no-cache (for index.html)
   - OR Cache-Control: max-age=31536000 (for .js/.css)
4. Files should have hash names: index-[HASH].js
```

---

## Debugging: How to Know What's Cached

### Check Browser Cache
```javascript
// In DevTools Console:

// 1. What endpoints is the app using?
console.log('API:', import.meta.env.VITE_API_ENDPOINT)
console.log('WebSocket:', import.meta.env.VITE_WS_ENDPOINT)
console.log('Client ID:', import.meta.env.VITE_COGNITO_CLIENT_ID)

// 2. What's stored locally?
console.log('localStorage:', localStorage)
console.log('sessionStorage:', sessionStorage)

// 3. Check if old values are cached
Object.keys(localStorage).forEach(key => {
  console.log(key, '=', localStorage.getItem(key))
})
```

### Check CloudFront Serving Correct Files
```bash
# Get file headers from CloudFront
curl -I https://[CLOUDFRONT-DOMAIN]/index.html
# Should show:
# X-Cache: Hit from cloudfront OR Miss from cloudfront
# Cache-Control: no-cache, max-age=0

curl -I https://[CLOUDFRONT-DOMAIN]/assets/index-[HASH].js
# Should show:
# Cache-Control: public, max-age=31536000, immutable
```

### Check S3 has new files
```bash
aws s3 ls s3://my-dashboard-frontend-[ACCOUNT]/ --recursive | tail -20
# Should show recent timestamps (today's date)
```

---

## Red Flags (Cache Problems)

| Issue | Indicator | Fix |
|-------|-----------|-----|
| Old JS Bundle | Console shows old endpoint | Hard refresh 3x, clear cache |
| Old Cognito ID | Login fails with wrong client ID | Delete `.env.production`, rebuild |
| Old WebSocket URL | WebSocket connects to old endpoint | Check `.env` matches new value |
| Stale CloudFront | Files dated weeks ago | Run `aws cloudfront create-invalidation` |
| Browser Cache | Same page after hard refresh | Open Incognito/Private window |
| localStorage Cache | Status resets on minimize | Run `localStorage.clear()` |

---

## Automated Verification Script

Run this **after deployment** to verify everything:

```javascript
// Paste in Browser Console (F12)

console.group('DEPLOYMENT VERIFICATION')

// 1. Check environment variables
const api = import.meta.env.VITE_API_ENDPOINT
const ws = import.meta.env.VITE_WS_ENDPOINT
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID

console.log('API Endpoint:', api)
console.log('WebSocket:', ws)
console.log('Client ID:', clientId)

// 2. Verify no old values
const oldApi = 'ysevwkoa69' // Old example
const oldWs = 'jiqy72fpc5' // Old example

if (api.includes(oldApi)) console.error('ERROR: Old API endpoint!')
if (ws.includes(oldWs)) console.error('ERROR: Old WebSocket endpoint!')

console.log('✓ Verification complete')
console.groupEnd()
```

---

## Summary: Prevention Strategy

**To prevent cache issues when deploying with new credentials:**

1. ✅ **Before deploying:**
   - Verify `.env` files have correct values
   - Ensure `.env.production` files are DELETED
   - Check file encoding is UTF-8

2. ✅ **During deployment:**
   - Run `./deploy-all.ps1`
   - Watch for "Extracted values" showing NEW credentials
   - Ensure builds complete without errors

3. ✅ **After deployment:**
   - Hard refresh browser 3x (`Ctrl+Shift+R`)
   - Open DevTools Console
   - Run verification script above
   - Check for NEW endpoints in console logs
   - Test functionality (login, WebSocket, status)

4. ✅ **If problems persist:**
   - Open Incognito/Private window
   - Check CloudFront is serving new files (check timestamps)
   - Run `aws cloudfront create-invalidation`
   - Wait 2-3 minutes for propagation

