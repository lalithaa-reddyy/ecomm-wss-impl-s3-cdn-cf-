# WebSocket Connection - Cache & Configuration Fix

## Problem Identified

The WebSocket is still connecting to the previous URL because:

1. **Encoding Issue**: `dashboard-frontend/.env.production` was UTF-16 encoded, Vite couldn't read it
2. **Build-time Substitution**: WebSocket URL is baked into JavaScript at build time
3. **Browser Cache**: Old JavaScript bundle is still cached in browser/CloudFront

---

## Root Cause Flow

```
Old URL in .env.production (UTF-16) 
    ↓ (Vite can't read UTF-16) 
undefined or fallback
    ↓ (Build time)
Old URL baked into app.js
    ↓ (Browser has old app.js cached)
Browser still connects to old URL
```

---

## Solution Steps

### Step 1: Fix .env.production File ✅ (DONE)
The file has been fixed:
- Changed from UTF-16 to UTF-8 encoding
- Current content: `VITE_WS_ENDPOINT=wss://f443j7ldv4.execute-api.us-east-1.amazonaws.com/prod`

### Step 2: Rebuild Frontend
```bash
cd dashboard-frontend
npm install  # If node_modules was deleted
npm run build
cd ..
```

### Step 3: Deploy with Cache Headers
```bash
# Use the updated deployment script (already fixed to handle cache)
./deploy-dashboard.sh
```

This will:
- Upload `index.html` with `no-cache` headers → browser always revalidates
- Upload JS bundles with 1-year cache → they're hash-versioned
- Invalidate CloudFront cache

### Step 4: Clear Browser Cache
**Critical**: Old JavaScript is in browser cache

**Option A - Hard Refresh:**
- Windows/Linux: `Ctrl+Shift+R`
- Mac: `Cmd+Shift+R`

**Option B - Clear All Cache:**
- Open DevTools: `F12`
- Right-click refresh button → "Empty cache and hard refresh"
- Or: DevTools → Application → Storage → Clear site data

### Step 5: Verify Connection
1. Open browser DevTools → Network tab
2. Look for WebSocket connection
3. Verify it shows the NEW URL: `wss://f443j7ldv4.execute-api.us-east-1.amazonaws.com/prod`
4. Check footer of dashboard - should display current WS_ENDPOINT

---

## What Changed

### Files Modified:
1. **dashboard-frontend/.env.production**
   - Fixed encoding: UTF-16 → UTF-8
   - Verified correct WebSocket endpoint

2. **deploy-dashboard.sh** & **deploy-generator.sh** (already updated)
   - `index.html` now uses `no-cache, max-age=0`
   - Static assets use aggressive caching
   - CloudFront invalidation works properly

---

## Testing Checklist

- [ ] Rebuilt frontend: `npm run build` 
- [ ] Deployed: `./deploy-dashboard.sh`
- [ ] Hard refreshed browser: `Ctrl+Shift+R`
- [ ] Network tab shows NEW WebSocket URL
- [ ] Dashboard connects without errors
- [ ] Metrics start streaming
- [ ] Footer shows correct WS endpoint

---

## Why .env Files Need UTF-8

Vite's environment variable loader expects UTF-8 encoded `.env` files:
```
✅ Correct: UTF-8 (ASCII compatible)
❌ Wrong: UTF-16 LE (what it was)
```

If file gets corrupted again:
```bash
# On Windows PowerShell:
$content = Get-Content "dashboard-frontend\.env.production"
$content | Out-File "dashboard-frontend\.env.production" -Encoding utf8

# On Mac/Linux:
file dashboard-frontend/.env.production  # Check encoding
```

---

## If Still Not Working

**Possible causes:**
1. CloudFront cache not cleared - wait 5 minutes and retry
2. Browser cache not cleared - try Incognito/Private window
3. DNS cache - try different network
4. Build didn't regenerate - check `npm run build` output

**Debug:**
```bash
# Verify URL in built JavaScript:
grep -r "f443j7ldv4" dashboard-frontend/dist/

# Should show the correct WebSocket endpoint in bundle
```

