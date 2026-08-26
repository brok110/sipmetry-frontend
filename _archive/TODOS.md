# TODOS

Generated from /plan-ceo-review on 2026-03-24. Branch: main.

## P1 — Before/During Validation

### Investigate beginner/intermediate target user
- **What:** Test whether people with 3-7 bottles respond more strongly to Smart Restock than serious bartenders (15+)
- **Why:** Codex challenged that serious home bartenders already know what to buy — "what should I buy next?" may be a beginner problem
- **Context:** During The Assignment (Reddit/Discord validation), vary the targeting. Post in beginner-friendly communities (r/cocktails) and see who engages most. No code changes needed — this is a positioning question.
- **Effort:** S | **Priority:** P1 | **Depends on:** Running The Assignment

## P2 — Post-Validation

### StoreKit review prompt
- **What:** Add `expo-store-review` prompt after user demonstrates value (e.g., 3+ "I made this" taps)
- **Why:** Highest ROI for App Store discoverability. Deferred from v1 because early bad ratings are hard to recover from.
- **Context:** iOS rate-limits to 3 prompts per 365 days. Gate app-side: only after a positive moment, once per session. Codex flagged: do NOT prompt before onboarding is proven smooth.
- **Effort:** S (CC: ~15 min) | **Priority:** P2 | **Depends on:** 20+ users completing scan→restock flow without friction

### Full product analytics
- **What:** Integrate PostHog, Mixpanel, or Amplitude for retention, engagement, and funnel tracking
- **Why:** Sentry breadcrumbs can't measure aggregate metrics (weekly engagement %, purchase CTR, Week 4 retention). Need real analytics to track quantitative success criteria.
- **Context:** Currently only have Sentry crash monitoring + session replay (10% sample) + affiliate click tracking. Breadcrumbs added in v1 for qualitative observation via session replay.
- **Effort:** M (CC: ~2 hours) | **Priority:** P2 | **Depends on:** v1 launch + initial users

## P3 — Post-Launch Polish

### Score breakdown transparency in Smart Restock
- **What:** Show users WHY a bottle is recommended — expand Smart Restock cards to display score breakdown (unlock count, versatility, preference match, interaction, similar_penalty)
- **Why:** Builds trust in purchase recommendations. Data already exists in API response (`score_breakdown` field) but is not displayed.
- **Context:** Currently cards show bottle name, "+X cocktails" badge, and a generic reason string. The score breakdown would help users understand and trust the ranking.
- **Effort:** S (CC: ~20 min) | **Priority:** P3 | **Depends on:** v1 launch
