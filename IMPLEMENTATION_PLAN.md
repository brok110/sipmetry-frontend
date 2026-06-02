# App Store Launch Prep — Implementation Plan

First-ever App Store submission. iPhone-only launch (iPad deferred, reversible).
ascAppId 6760887396, bundle com.sipmetry.app.

## Stage 1: app.json corrections
**Goal**: app.json is submission-clean — correct display name, no iPad
audit surface, no duplicate plugins, brand-correct notification color,
dead Android audio permissions removed.
**Success Criteria**:
- supportsTablet = false
- Display name = "Sipmetry"
- Single Sentry plugin entry (expo plugin form only)
- Notification color = #E0A030 (OaklandDusk sundown)
- expo-audio retained (playback only); RECORD_AUDIO removed; no mic usage string added
- prebuild-generated Info.plist contains NO empty/unwanted NSMicrophoneUsageDescription
- `npx tsc --noEmit` clean
**Tests**:
- `npx expo prebuild --platform ios --no-install` succeeds
- grep Info.plist for NSMicrophoneUsageDescription -> absent
- grep Info.plist for ipad orientation key -> absent
**Status**: In Progress

## Stage 2: Asset validation
**Goal**: icon + splash pass Apple/EAS ingestion.
**Success Criteria**: icon.png = 1024x1024, NO alpha channel; splash renders.
**Tests**: `sips -g pixelWidth -g pixelHeight -g hasAlpha assets/images/icon.png`
**Status**: Not Started

## Stage 3: Launch readiness (non-file)
**Goal**: nothing review-blocking at runtime.
**Success Criteria**:
- Render backend warm during review window (paid tier or keep-alive)
- All Supabase tables RLS-enabled (cross-check SECURITY_HARDENING_PLAN.md)
- In-app account deletion entry point exists (backend DELETE /account confirmed)
**Status**: Not Started

## Stage 4: App Store Connect metadata (dashboard)
**Goal**: listing complete + passes App Review guidelines.
**Success Criteria**:
- Age rating 17+ (Alcohol References)
- Category: Food & Drink
- Description / subtitle / keywords written
- iPhone screenshots at Apple's current required sizes
- Privacy Policy URL + Support URL live
- App Privacy questionnaire completed
**Status**: Not Started

---

## Sound subsystem note (mic permission cleared)
lib/sounds.ts is playback-only (createAudioPlayer / play / loop / pause /
release). No recording APIs. Confirmed verbally + by code read. iOS needs
NO NSMicrophoneUsageDescription. Stage 1 prebuild step verifies expo-audio
plugin does not inject one.
