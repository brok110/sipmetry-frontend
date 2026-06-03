# App Store Launch Prep — Implementation Plan

First-ever App Store submission. iPhone-only launch (iPad deferred, reversible).
ascAppId 6760887396, bundle com.sipmetry.app.

## Stage 1: app.json corrections
**Status**: Complete (frontend 1a00e09)
- supportsTablet=false (iPhone-only); display name "Sipmetry"; removed
  duplicate sentry plugin; notification color #E0A030; removed dead Android
  audio permissions; expo-audio -> { microphonePermission: false }.
- Verified: tsc clean; prebuild Info.plist has NO mic usage string.

## Stage 2: Asset validation
**Status**: Complete (no change needed)
- icon.png = 1024x1024, hasAlpha: no. Passes.

## Stage 3: Launch readiness (runtime)
**Status**: Complete
- RLS: 24/24 tables enabled. Dropped 2 overdue 4b backup tables
  (user_inventory_backup, ingredient_ontology_backup).
- Render: Starter instance, does not spin down. No cold-start risk.
- Account deletion: UI present (double-confirm, DELETE /account). Backend
  handler transactional + allowlisted. FIXED residue gap: added
  affiliate_clicks, token_ledger, usage_log to DELETE_ACCOUNT_TABLES
  (backend dc46e77, pushed). feedback_events left out (anonymized by design).

## Stage 4: App Store Connect listing + launch compliance
**Status**: In Progress

### 4a. Sentry data minimization (code)
**Status**: Done locally, PENDING COMMIT (app/_layout.tsx)
- sendDefaultPii=false, removed session replay + feedback widget,
  enabled=!__DEV__. Crash/error only. Verified: tsc clean, app boots.

### 4b. Privacy Policy revision (docs/privacy.md)
**Status**: Done locally, PENDING COMMIT
- Disclosed Sentry across 5 touchpoints (3rd-party table, links, §1, §4,
  appendix Crash Data row).
- Corrected §4 deletion description to match implementation: immediate bulk
  delete; auth-retry queue (pending_auth_deletions); share-link TTL (7 days,
  verified server.js:5111). Bumped last-updated to June 2, 2026.
- Verified against backend: auth retry + share TTL both confirmed in code.

### 4c. Terms of Service
**Status**: No change (legally fine as-is; "cocktail recommendation app"
description is fine for a legal doc). Privacy Policy URL confirmed live at
brok110.github.io/sipmetry-frontend/privacy.

### 4d. App Store listing copy
**Status**: Drafted, NOT YET ENTERED
- Subtitle: "Your home bar, decoded"
- Promo text + Description drafted (decision-engine framing, no buy/unlock language)
- Keywords drafted (100 bytes)
- TODO: current ASC page still has old "buy next / unlock recipes" copy ->
  must replace (App Review red flag for alcohol + contradicts positioning).

### 4e. Remaining ASC dashboard items (not started)
- Age rating: 17+ (Alcohol References)
- Category: Food & Drink
- App Privacy questionnaire: declare Crash Data under Diagnostics (not linked
  to identity, no tracking) to match privacy policy
- iPhone screenshots (6.5" display; verify Apple's current required sizes at submission)
- Support URL

## Pending commits
- Frontend: app/_layout.tsx (Sentry) + docs/privacy.md (policy) -> 2 commits,
  then push (triggers GitHub Pages re-publish of live privacy policy).
- This plan file to be committed alongside.

## Post-launch backlog (non-blocking)
- ingredient_ontology.value='rose_wine' -> rose_wine (key convention)
- SECURITY_HARDENING_PLAN.md backend app-layer items (all Not Started; deferred)
- shared_recipes: consider null-ing user_id on deletion (currently TTL-expires)
