# Cache Pipeline Analysis - Client ID Issue

## Problem Summary
When you configure a new client ID, the previous one is still being invoked. This is a **caching issue across multiple layers**.

---

## Caching Layers Identified

### 1. **CloudFront Cache Policy** ⚠️ MAIN ISSUE
**Location**: `template.yaml` lines 80, 142
**Cache Policy ID**: `658327ea-f89d-4fab-a63d-7e88639e58f6` (Caching Optimized)

**Settings**:
- Default TTL: 86,400 seconds (24 hours)
- Maximum TTL: 31,536,000 seconds (1 year)
- **Caches ALL files**: `index.html`, JS bundles, CSS, etc.

**Problem**: Even though deployment scripts run CloudFront invalidation:
```bash
aws cloudfront create-invalidation --distribution-id "${DASHBOARD_DIST_ID}" --paths "/*"
```
...the policy still caches aggressively for 24 hours.

### 2. **Browser Cache**
**Location**: Browsers cache static files based on HTTP headers
**Problem**: Even with CloudFront invalidation, browser cache holds old JavaScript bundles

### 3. **API Response Caching**
**Location**: `frontend/src/optimizations.js` (lines 77-178)
**Cache Class**: `APICache`
**TTL**: 2 seconds (low priority but still exists)

This is **not the main issue** since it only caches for 2 seconds, but it's worth noting.

### 4. **localStorage/sessionStorage**
**Location**: `frontend/src/App.jsx` (line 46-47)
```javascript
localStorage.setItem("authToken", token);
localStorage.setItem("username", username);
```

**Current State**: Auth tokens are stored but NOT configuration/client IDs (low priority)

---

## Root Cause Analysis

### Deployment Flow
1. Update `.env.production` with new client ID
2. Run `npm run build` (Vite generates hash-based bundles)
3. Run `aws s3 sync` (uploads to S3)
4. Run `aws cloudfront create-invalidation` (invalidates CloudFront edge cache)

### What Breaks
1. **CloudFront invalidation works** ✓ (clears edge cache)
2. **S3 has new files** ✓
3. **BUT**: Browser still has old cached files because:
   - Old `index.html` is cached in browser
   - Old bundled JS files are cached
   - New request goes to old cached HTML which references old JS bundles

### Why the Old Client ID Gets Used
The env variables are embedded at **build time**:
```javascript
// dashboard-frontend/src/App.jsx line 4
const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT;
```

When `index.html` is cached, the JavaScript bundle it references is the OLD one with the OLD client ID baked in.

---

## Solutions

### **Option 1: Fix CloudFront Cache Policy (RECOMMENDED)**
Separate caching strategies for different file types:

**For `index.html`**:
- Cache-Control: `no-cache, max-age=0` (always revalidate)
- Or use CloudFront behavior-specific policies with 0 TTL

**For bundled assets** (JS, CSS with hash names):
- Keep current aggressive caching (they're hash-versioned)
- Cache-Control: `public, max-age=31536000` (1 year)

### **Option 2: Update CloudFront with Cache Behaviors**
Split distribution into multiple behaviors:

```yaml
DefaultCacheBehavior:  # index.html
  CachePolicyId: 4135ea3d-c35d-46eb-81d7-rewrittenURLS  # Managed-CachingDisabled
  PathPattern: "/"
  
CacheBehaviors:        # Static assets
  - PathPattern: "/src/*"
    CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6  # Caching Optimized
```

### **Option 3: Add Version Query Parameter (Quick Fix)**
Modify deployment to append timestamp/version to HTML:

```bash
# In deploy script
TIMESTAMP=$(date +%s)
aws s3 cp dashboard-frontend/dist/index.html \
  "s3://${DASHBOARD_BUCKET}/index.html" \
  --metadata "version=${TIMESTAMP}" \
  --cache-control "no-cache, max-age=0"
```

### **Option 4: Use S3 Metadata Headers**
For S3 uploads, set explicit Cache-Control headers per file type:

```bash
# In deploy script - short cache for index.html
aws s3 sync dashboard-frontend/dist/ "s3://${DASHBOARD_BUCKET}/" \
  --delete \
  --exclude "*" \
  --include "index.html" \
  --cache-control "no-cache, max-age=0" \
  --metadata-directive REPLACE

# Long cache for assets with hash names
aws s3 sync dashboard-frontend/dist/ "s3://${DASHBOARD_BUCKET}/" \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000"
```

---

## Implementation Steps

### **Immediate Fix (Option 4 - Recommended)**
Update both deploy scripts:

**Changes to `deploy-dashboard.sh`**:
```bash
# Add Cache-Control headers when uploading
aws s3 sync dashboard-frontend/dist/ "s3://${DASHBOARD_BUCKET}/" \
  --delete \
  --exclude "*" \
  --include "index.html" \
  --cache-control "no-cache, max-age=0" \
  --metadata-directive REPLACE

aws s3 sync dashboard-frontend/dist/ "s3://${DASHBOARD_BUCKET}/" \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000"
```

**Changes to `deploy-generator.sh`**:
Same changes as above

### **Long-term Fix (Option 1 - Best Practice)**
Update `template.yaml` to use separate cache behaviors:

```yaml
DefaultCacheBehavior:  # index.html only
  TargetOriginId: DashboardS3Origin
  ViewerProtocolPolicy: redirect-to-https
  CachePolicyId: 4135ea3d-c35d-46eb-81d7-8eede1d0d4b8  # Caching Disabled
  
CacheBehaviors:  # Static assets
  - PathPattern: "*.js"
    TargetOriginId: DashboardS3Origin
    ViewerProtocolPolicy: redirect-to-https
    CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6  # Caching Optimized
  - PathPattern: "*.css"
    TargetOriginId: DashboardS3Origin
    ViewerProtocolPolicy: redirect-to-https
    CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6
```

---

## Browser Cache Workaround (Immediate)

Users can force refresh to clear browser cache:
- Windows/Linux: `Ctrl+Shift+Delete` (open dev tools) → Empty cache
- Mac: `Cmd+Shift+Delete`
- Or use DevTools → Network → "Disable cache" checkbox

---

## Verification Checklist

After implementing fix:
- [ ] Deploy new client ID
- [ ] Check CloudFront invalidation completes
- [ ] Wait 1-2 minutes for propagation
- [ ] Hard refresh browser (`Ctrl+Shift+R`)
- [ ] Verify new client ID is being used in browser console
- [ ] Check WebSocket endpoint in footer matches `.env.production`

---

## Files Affected
- `deploy-dashboard.sh` - Add Cache-Control headers
- `deploy-generator.sh` - Add Cache-Control headers
- `template.yaml` - (Optional) Update CloudFront behaviors

