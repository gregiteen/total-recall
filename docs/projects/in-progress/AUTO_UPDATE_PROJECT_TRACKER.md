# Project Tracker: Auto-Update Feature

## ⏳ Phase 1: Backend Integration
- [ ] Create `GET /api/update/check` endpoint to check npm registry for new versions
- [ ] Create `POST /api/update/run` endpoint to run git pull and trigger daemon restart
- [ ] Implement error handling and secure exit timeouts

## ⏳ Phase 2: Frontend Implementation
- [ ] Update `frontend/src/pages/HealthPage.tsx` to call checker API and display updates
- [ ] Implement confirmation modal and updating status overlay in UI
- [ ] Implement health polling and auto-reload on server recovery

## ⏳ Phase 3: Testing & Verification
- [ ] Verify endpoint response structures
- [ ] Run TypeScript quality compiler script
- [ ] Run ESLint lint script
- [ ] Run Vite production build check
