# Frontend Status & Event Generation Issues - Analysis & Fixes

## Issues Identified

### Issue 1: Status Resets When Browser Minimized/Reopened
**Problem:** 
- Frontend shows "Running" but changes to "Stopped" when you minimize the browser
- Clicking Start/Stop button works, but closing/opening the tab loses state

**Root Cause:**
- Status was stored ONLY in React state (`useState`)
- React state is lost when component unmounts or page reloads
- No persistence across browser sessions

**Solution Applied:** ✅ FIXED
- Status now saved to `localStorage` 
- On page load, status is restored from `localStorage`
- Whenever status changes, it's persisted
- Status persists across page reloads, browser minimization, etc.

**Files Changed:**
- `frontend/src/App.jsx` - Added localStorage persistence

---

### Issue 2: Inconsistent Event Updates (40s interval, exactly 2000 events)
**Problem:**
- Events are updated every 40 seconds
- Always increment by exactly 2000 events
- Not consistent with the requested rate of 120000ms (120 seconds)

**Root Cause:**
The backend event generator is likely configured with:
- **Batch size:** 2000 events per batch
- **Interval:** 40 seconds (40000ms) between batches
- But frontend requested: rate 120000ms (120 seconds)

This mismatch suggests:
1. Backend has hardcoded batch configuration
2. Or there's a different generator rate than what frontend is requesting

**Solution:** Check backend configuration

Run this to check the actual event generation configuration:
```bash
grep -r "rate\|batch\|2000\|40000\|120000" event-generator/ --include="*.js" --include="*.json"
```

**To Change Event Rate:**
Edit the frontend request in `App.jsx` line 142:
```javascript
// Current: 120 seconds between events
const response = await callAPI("/generate", { action: "start", rate: 120000, disableTemporal: true });

// Change to (in milliseconds):
// 10000 = 10 seconds
// 30000 = 30 seconds
// 60000 = 60 seconds
// 300000 = 5 minutes
```

---

## Current Status After Fixes

✅ **Frontend Status Persistence** - FIXED
- Status now saved to localStorage
- Survives browser minimize/reopen
- Survives page refresh
- Survives tab close/open

⚠️ **Event Generation Rate** - INVESTIGATE
- Check backend event-generator configuration
- Verify `rate` parameter is being respected
- Check for hardcoded batch sizes

---

## Testing Checklist

### Test 1: Status Persistence
- [ ] Open frontend
- [ ] Click "Start Stream"
- [ ] Verify status shows "Running"
- [ ] Minimize browser
- [ ] Reopen browser tab
- [ ] Status should still show "Running" ✓
- [ ] Refresh page with F5
- [ ] Status should still show "Running" ✓

### Test 2: Start/Stop Functionality  
- [ ] Click "Start Stream" - should show running
- [ ] Click "Stop Stream" - should show stopped
- [ ] Refresh page - status should persist
- [ ] Click Start again - should work

### Test 3: Event Generation Rate
- [ ] Start the stream
- [ ] Open dashboard
- [ ] Observe event update frequency
- [ ] Should match the configured rate

---

## Backend Investigation

If you still see 40-second intervals with 2000 events:

1. **Check event-generator configuration:**
```bash
cat event-generator/package.json | grep -A5 "scripts"
grep -r "40" event-generator/app/ --include="*.js"
grep -r "2000" event-generator/app/ --include="*.js"
```

2. **Check Lambda timeout settings:**
```bash
grep -A10 "EventGeneratorFunction:" template.yaml | grep -i timeout
```

3. **Check if there's a hardcoded batch size:**
```bash
grep -r "batch\|BATCH\|size\|SIZE" event-generator/ --include="*.js"
```

---

## Files Modified

- `frontend/src/App.jsx`:
  - Added localStorage persistence for status
  - Status survives browser reload, minimize, etc.

---

## Next Steps

1. **Rebuild frontend:**
   ```bash
   cd frontend
   npm run build
   cd ..
   ```

2. **Redeploy:**
   ```bash
   ./deploy-all.ps1
   ```

3. **Test status persistence** (see checklist above)

4. **Investigate event rate** if still seeing 40s intervals

