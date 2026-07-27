# Sipmetry Frontend Backlog

Central tracker for frontend technical debt and deferred work.

---

## iOS 26 native back button disabled (RNS #3294)

**Status:** Worked around (custom headerLeft); proper fix deferred.

**Symptom:** On iOS 26 (simulator AND real device, New Arch), the native
header back button becomes disabled after: navigate to a screen with
headerShown:false / custom header → push next screen → go back → push
again. In Sipmetry: recipe (headerShown:false) → qr → Back to Recipe →
recipe → share again → qr = native back dead. Caused a recipe<->qr
navigation loop.

**Root cause:** react-native-screens 4.16.0 native bug, NOT app code.
https://github.com/software-mansion/react-native-screens/issues/3294
Confirmed env match: RNS 4.16.0 + iOS 26 + Fabric/New Arch.

**Current workaround (shipped):** Custom headerLeft Pressable using
router.back() on the qr screen in _layout.tsx — programmatic back is
unaffected by the bug. Also switched qr's "Back to Recipe" from
router.push to router.back (commits 85b7a14, 153575c). The underlying
native bug remains; any future screen relying on the native back button
after a headerShown:false screen will hit the same issue.

**Proper fix (deferred):** Upgrade react-native-screens to a version with
the iOS 26 fix (latest 4.25.2 as of writing). Blocked by: Expo 54 pins RNS
to 4.16.0; manual upgrade bypasses `expo install` and risks native-module
compat conflicts. Do this when bumping the Expo SDK, then remove the
headerLeft workaround if native back is restored.

**Possibly same root cause:** Existing note "Bartender NavigationStack
large title + masthead both visible in some branches — suspected
headerShown:false not applied" may be the same iOS 26 + RNS header issue.
Re-verify when upgrading RNS.

---

## Bartender rail chain — RN performance (2026-07-26 scan)

**Status:** Batch 1 shipped — commit `5ae7965` (2026-07-26): D1-D3, P0-1a,
P1-3, P1-4, P1-5, P2-8, P2-9, P2-10, P2-11. Pure memo/hoist/dead-code removal,
no pixel or data-flow change (see the Batch 1 section below for the full
list). P0-1b shipped — commit `54bb608` (2026-07-26): RN `Image` →
`expo-image` in `RecipeCard.tsx` + `recipe.tsx`, `resizeMode` → `contentFit`,
cachePolicy/placeholder/transition left at defaults (disk cache is already
the default, so no behavior change). P1-6 shipped — commit `2e1b2b8`
(2026-07-26): `renderDbIngredients()` extracted to a memoized
`components/DbIngredientsList.tsx`, row/badge colors moved to named
`StyleSheet` variants (no array merges), both SSoT/local-fallback
availability paths preserved verbatim. Remaining, pending:

- **P0-1c** — needs a product decision from Brok: window the rail (derived
  visible-index range, medium risk) vs. drop `MAX_RAIL_CARDS` 12 → ~8
  (fewer faces per rail, no new risk). Unresolved — Brok's call.
- **P0-2** — symptom (1) (search boundary mount/unmount) is a behavior
  change and needs sign-off before implementing. Symptom (2) (per-keystroke
  grid re-render) was already resolved by P0-1a/P1-5 in Batch 1.
- **P1-7** — low risk but large surface (~100 inline styles) and touches
  visuals; needs its own commit + a DESIGN.md/screenshot diff pass per
  CLAUDE.md before it can ship.

**Scope scanned:** `app/(tabs)/bartender.tsx`, `components/browse/RailRow.tsx`,
`components/browse/LoopingRail.tsx`, `components/browse/RecipeCard.tsx`,
`lib/browse/rowEngine.ts`, `app/recipe.tsx`. Ranked against the rule set in
`.claude/skills/vercel-react-native-skills`.

**The number everything else ranks against (derived, not measured):**
`MAX_RAIL_CARDS = 12` (rowEngine.ts:39) × `CARD_WIDTH + CARD_GAP = 140` gives
a rail period of 1680px. On a 393pt device `LoopingRail.tsx:37` computes
`copies = 2`, so each rail mounts 24 cards. The page is READY + 3 middle +
HUNT = up to 5 rails, so:

- ~120 `RecipeCard` mounted at once, ~6 of them visible
- ~8 native views per card → ~950 views
- 120 remote `Image` + 120 `LinearGradient` native views
- outer container is a plain `ScrollView` (bartender.tsx:603) — no
  virtualization anywhere in the chain

`copies = 2` is already the mathematical floor for a seamless loop
(`(copies-1)*period >= viewportWidth`), so it cannot just be lowered.

### P0

**P0-1. 120 cards mounted, unvirtualized.** bartender.tsx:603 +
LoopingRail.tsx:79-83. Dominates first-paint cost, memory, and vertical
scroll jank. Three separable sub-items:

- **P0-1a [zero risk] — no memo anywhere in the chain.** `React.memo` count
  across the repo is 0 and React Compiler is off (`app.json` experiments is
  `typedRoutes` only), so every bartender render re-renders all 120 cards.
  Compounded by a fresh closure per cell (LoopingRail.tsx:81
  `onPress={() => onPressItem(item)}`) and an inline style array
  (RecipeCard.tsx:54). Fix: `memo` on `RecipeCard` + `BucketChip`, stabilize
  the cell callback, `useMemo` the width/dimmed style combination.
  Rules: `list-performance-item-memo`, `list-performance-callbacks`,
  `list-performance-inline-objects`.
- **P0-1b [needs a new dependency] — RN `Image` → `expo-image`.**
  RecipeCard.tsx:61, recipe.tsx:1304. `expo-image` is NOT currently in
  package.json. RN's built-in Image has no disk cache and no view recycling;
  120 simultaneous decodes is where the memory pressure comes from. Requires
  `npx expo install expo-image` + a dev client rebuild, plus `resizeMode` →
  `contentFit` (note recipe.tsx:1306 passes `resizeMode` inside `style`).
  Rules: `ui-expo-image`, `list-performance-images`.
  **Shipped: commit `54bb608`** (2026-07-26).
- **P0-1c [needs a product decision] — window the rail, or cut
  `MAX_RAIL_CARDS`.** The only change that actually takes 120 → ~30. Either
  (a) derive the visible index range from `wrapped` and mount ~5 cells
  (needs a derived value + index-change-throttled `runOnJS`; medium risk), or
  (b) drop rowEngine.ts:39 from 12 to ~8 → 80 cards. (b) means fewer faces
  per rail — Brok's call.

**P0-2. Every keystroke re-renders the whole bartender screen, and crossing
the search boundary unmounts/remounts everything.** `query` lives at screen
root (bartender.tsx:107). Two symptoms: (1) `"" → "a"` flips `resultsActive`
and unmounts the entire 120-card ScrollView; clearing the query mounts it all
back — a visible hitch. (2) With results on screen, each character
re-renders 30 unmemoized grid cards. P0-1a fixes symptom (2) on its own.
Symptom (1) needs the carousel to stay mounted behind an overlay — that is a
behavior change and needs sign-off.

### P1

- **P1-3 [zero risk] — `Gesture.Pan()` rebuilt every render.**
  LoopingRail.tsx:44-55, not memoized, so `GestureDetector` re-registers
  handlers on every render, once per rail. Wrap in `useMemo`; the handlers
  only touch the `offset` shared value, so there is no stale-closure risk.
- **P1-4 [zero risk] — inline `onPressItem` + unmemoized `RailRow`.**
  bartender.tsx:648. `openBrowseRecipe` is already `useCallback([])`; only the
  `"browse"` constant needs binding away, plus `memo(RailRow)`.
- **P1-5 [zero risk] — search FlatList render props are all inline.**
  bartender.tsx:559-580 (`keyExtractor`, `renderItem`, `ListHeaderComponent`).
  Hoist `keyExtractor`, `useCallback` the `renderItem`, add
  `initialNumToRender` / `windowSize`. limit is 30, so FlashList is not
  warranted — do not add the dependency for this.
- **P1-6 [low risk] — `renderDbIngredients()` is a function, not a
  component.** recipe.tsx:990-1149. Re-runs on every render: rebuilds the
  `invByKey` map and allocates dozens of inline style objects. One tap on the
  servings stepper re-runs the whole thing. Extract to a memoized component,
  `useMemo` the map, move styles into `StyleSheet.create`.
  **Shipped: commit `2e1b2b8`** (2026-07-26).
- **P1-7 [low risk, large surface] — recipe.tsx is almost entirely inline
  styles.** Roughly a hundred `style={{...}}` literals between lines 1219 and
  1652. Violates `ui-styling`. Mechanical rewrite, but big enough to deserve
  its own commit — and it touches visuals, so per CLAUDE.md read DESIGN.md
  first and diff screenshots to confirm no numeric drift.

### P2

- **P2-8 [zero risk] — helpers defined inside the component.** recipe.tsx:83
  `paramToString`, :217 `humanizeKey`, :228
  `resolveDisplayForIngredientKey`. First two are pure and can be hoisted to
  module scope; the third closes over `scanDisplayByCanonical` so it needs
  `useCallback`. Rule: `list-performance-function-references`. Note there is
  already a different `humanizeKey` at rowEngine.ts:104 (it does not
  capitalize) — confirm the semantics before merging the two.
- **P2-9 [zero risk] — confidence-signal IIFE.** recipe.tsx:1350-1397 runs two
  passes over the ingredient list on every render. Wrap in `useMemo`. Small
  absolute saving; this is about the principle, not milliseconds.
- **P2-10 [zero risk] — inline `<Stack.Screen options={{...}} />`.**
  recipe.tsx:1213 and :1156 allocate a new object per render and re-trigger
  the navigator's setOptions. Hoist to module constants.
- **P2-11 [zero risk] — uncleared `setTimeout`.** recipe.tsx:1595-1603 fires
  `setFavHintVisible` after 3s with no cleanup, so leaving the screen right
  after the tap sets state on an unmounted component. Store in a ref and
  clear on unmount.

### Batch 1 — pure deletion / zero risk (execute together)

Pure deletions:

| # | Location | What | Note |
|---|----------|------|------|
| D1 | recipe.tsx:1597, :1599 | two `console.log("[DEBUG] …")` | pure deletion |
| D2 | recipe.tsx:66-68 | `useEffect` setting `navigation.setOptions({ title: "Recipe" })` | **dead code** — both return branches override it (`:1213` is `headerShown:false`, `:1156` is `title:""`). Deleting it also removes the `useNavigation` import at `:3` and the call at `:63`; grepped, there are no other uses in the file |
| D3 | RecipeCard.tsx:89-91 | empty `card: {}` StyleSheet rule | fold into P0-1a |

Batch 1 = D1–D3 plus P0-1a, P1-3, P1-4, P1-5, P2-8, P2-9, P2-10, P2-11. None
of these change a pixel or a data flow — they only move identity and memo
boundaries.

**Shipped: commit `5ae7965`** (2026-07-26). Re-measure, then decide on
P0-1b / P0-1c / P0-2 — see the Status block at the top of this section for
what each one (plus P1-6 / P1-7) is still waiting on.

### Explicitly NOT a problem — do not spend time here

**`lib/browse/rowEngine.ts` is not a bottleneck.** The expected hotspot was
`unused()` (:160), which does run ~8-10 full-table filters per `buildRails`,
and `claim()` (:165), which sorts up to 250 rows each time. But it only runs
when `browseItems` / `refreshNonce` change, it is a pure function, and it is
already memoized at bartender.tsx:363. At a 250-row scale that is a few
thousand comparisons — orders of magnitude below mounting 120 native card
subtrees. Optimizing it before P0 would be wasted effort.

**The `LoopingRail` animation itself is correctly built.** `offset` is a
shared value, `useAnimatedStyle` only drives `translateX`, the modulo wrap
stays on the UI thread, `withDecay` needs no JS round-trip, and
`activeOffsetX` / `failOffsetY` already yield correctly to the outer vertical
ScrollView. Satisfies `animation-gpu-properties`. The only change needed here
is the gesture memo in P1-3.

---

## recommendations.tsx defines list-item components inside the screen

**Status:** Logged 2026-07-26, not fixed. Found while scanning the bartender
rail chain; out of that scan's scope, so it was never investigated in depth.

**Symptom (not yet reproduced on device):** `RecipeCard`
(app/recommendations.tsx:205-322, ~117 lines) and `SectionHeader` (:324-332)
are declared inside the `RecommendationsScreen` component body, and both are
rendered from the FlatList `renderItem` (:448 and :451).

**Root cause:** A component declared in a render body is a brand-new
component type on every render. React cannot reconcile the old type against
the new one, so every rendered list row **unmounts and remounts** rather than
re-rendering — native views are torn down and rebuilt, mount effects re-run,
and any internal state is lost. This is strictly worse than the missing-memo
problems in the bartender chain, where rows at least only re-render. The
list's `initialNumToRender={8}` / `maxToRenderPerBatch={6}` / `windowSize={5}`
props (:459-461) limit how many rows pay the cost, but do not prevent it.

**Fix:** Hoist both components to module scope, pass what they currently
close over as props, and wrap them in `React.memo`. Needs a read of the whole
file first — the closure surface has not been mapped.

---

## recipe.tsx availability effect has incomplete deps (latent)

**Status:** Logged 2026-07-26. Latent — **not reachable today.** Correctness,
not performance; recorded here because it was found during the perf scan.

**Symptom:** The `/recipe-availability` effect at app/recipe.tsx:434-486 reads
`scanItems` at :464 (guest branch only) but its dependency array (:486) is
`[ibaCode, session, isGuestSession]`. If `scanItems` ever changed while the
screen stayed mounted, the effect would post the stale value.

**Why it is not a live bug:** `scanItems` is a `useMemo` over
`params.scan_items_json`, and route params are fixed for the lifetime of a
mounted screen unless something calls `router.setParams`. Grepped the whole
app: the only `setParams` call is app/(tabs)/cart.tsx:116, on a different
screen. So the stale read cannot occur as the code stands.

**Trigger to watch for:** anything that adds `router.setParams` on the recipe
screen, or that starts feeding `scan_items_json` from state rather than
navigation params. If either lands, this becomes a real guest-mode bug.

**Fix when touched:** add `scanItems` to the dependency array, or derive the
detected-ingredients payload inside the effect from a ref. Note that adding
it as-is will re-fire the fetch whenever the memo identity changes, so the
memo needs to stay stable.

---

## DbIngredientsList.tsx: `availBadge` is computed but never rendered (dead code)

**Status:** Logged 2026-07-26, not fixed. Found while executing P1-6 —
inherited as-is from the pre-extraction `renderDbIngredients()`, so it
predates this session; the extraction faithfully preserved it rather than
cleaning it up (P1-6 was scoped as a pure identity move, not a behavior
audit).

**Symptom:** `components/DbIngredientsList.tsx:93-126` builds
`let availBadge: React.ReactNode = null;` and assigns it across all 6
branches of the SSoT/local-fallback availability logic (missing, running low
×2, in-bar-ok ×2, substitute) — real work, not a no-op. The row JSX returned
at :148-165 never references `{availBadge}` anywhere. Confirmed via grep: the
identifier appears only in the assignment branches, never in a render
position. The variable is computed and discarded every render, for every
ingredient row.

**Root cause:** Confirmed pre-existing in the original `renderDbIngredients()`
before extraction, not something P1-6 introduced. Likely a leftover from an
earlier design where the row rendered `availBadge` as a second status line,
later superseded by the border-color band + small badge pill (the
`bandKey`/`ROW_STYLE_BY_BAND` logic a few lines below it) without deleting
the now-unused computation.

**Fix (deferred, separate from P1-6):** Either delete the whole `availBadge`
block (6 branches, ~34 lines) once it's confirmed the band+badge treatment
already carries the same information, or find where it was meant to render
and wire it in. Needs a product call on which is correct before touching it —
that's why it stayed out of P1-6's zero-risk scope.

---

## iOS Simulator MCP tool: `attach`/`tap` fail with a spurious Xcode-select error

**Status:** Logged 2026-07-26. Recurring across three separate sessions
(Batch 1, P0-1b, P1-6) — track here instead of re-diagnosing from scratch
each time.

**Symptom:** `mcp__Claude_Code_iOS_Simulator__control` with `action: "attach"`
or `action: "tap"` fails every time with: "Xcode is installed but not
selected. Run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
...". This is the tool's own precondition check, not a real state of the host.

**Why it's likely a false positive:** In the same shell environment,
`xcode-select -p` reports `/Applications/Xcode.app/Contents/Developer`,
`xcodebuild -version` reports a working Xcode 26.6 install, and a raw
`xcrun simctl launch` / `xcrun simctl io ... screenshot` against the booted
simulator both succeed without issue. So the actual toolchain is fine — the
MCP tool's internal check (likely running in a different process/env context
than the Bash tool) is disagreeing with reality.

**Current workaround:** Screenshots and app launch/relaunch via raw
`xcrun simctl` (`launch`, `terminate`, `io ... screenshot`) work fine and were
used for verification in all three sessions. What raw `simctl` can't do:
simulate taps/gestures — there's no `simctl` subcommand for that — so any
verification step that needs a tap (e.g. navigating into a recipe detail
screen) has to be handed to Brok to do by hand.

**Fix:** Unclear whether this is fixable from this environment at all —
`sudo xcode-select -s ...` needs Brok's password to even test whether it's a
real fix or the tool's check is simply broken. Re-test next time the tool is
needed rather than assuming it's still broken; if it still fails after a
manual `sudo xcode-select -s` confirmation, the tool's precondition check
itself is the bug and worth a report upstream rather than another local
workaround.

---

## recipe.tsx: feedback toast + Like/Dislike buttons use raw color codes, not OaklandDusk tokens

**Status:** Logged 2026-07-26, not fixed. Toast instance found while scoping
P1-7's commit boundaries; Like/Dislike instances found and consolidated here
(not a new entry) while executing P1-7 commit 2. Both are design decisions,
not mechanical relocations — deliberately not bundled into P1-7's mechanical
commits.

**Symptom — toast:** `app/recipe.tsx`'s "Stage 3: First-interaction feedback
toast" block (currently ~line 1481-1500) uses `backgroundColor: "#1e293b"`
and `color: "white"` — neither matches any token in `DESIGN.md`'s
OaklandDusk palette. `#1e293b` is a cool slate-blue, at odds with the
documented "warm neutrals from deep void to warm ivory" palette; nothing in
`bg.*` is close. `"white"` isn't `text.primary` (`#F0E4C8`, warm ivory)
either.

**Symptom — Like/Dislike buttons:** the rating row's selected-state colors
(now `styles.ratingButtonLikeSelected`, `styles.ratingButtonDislikeSelected`,
`styles.ratingTextLikeSelected` in the `StyleSheet.create` block P1-7 commit
2 added) use `"#1A2A1A"` / `"#6B8F6B"` (like-selected background/border+text)
and `"#3A2A2A"` (dislike-selected background) — 3 more raw hex codes with no
matching OaklandDusk token. Note `OaklandDusk.accent.crimson` (dislike's
selected border/text/icon color) is already a real token — not a violation,
not one of the 3 codes above.

**Fix (deferred):** Needs a product/design call on which token(s) actually
belong in each spot (`bg.card` + `text.primary` are the obvious toast
candidates, but worth confirming intentionally; the Like/Dislike greens have
no obvious existing OaklandDusk match and may need a new token) — not a
P1-7-style pure relocation, so kept out of the mechanical
inline-style-to-StyleSheet passes (commits 3 and 4 still ahead).

---

## recipe.tsx: taste tag pill styles reconfigured per-item inside `.map()`

**Status:** Logged 2026-07-26, not fixed. Found while scoping P1-7's commit
1 (Nav bar + hero image + tags + loading card) — deliberately left inline
rather than folded into that commit's `StyleSheet.create` extraction.

**Symptom:** `app/recipe.tsx`'s taste-tag row (currently ~lines 1194-1206)
allocates a fresh `<View style={{...}}>` and `<Text style={{...}}>` per tag
inside `tasteTags.map(...)`. Neither style actually varies by `tag` — every
pill gets the identical object, just a freshly allocated reference each
iteration — so both could be hoisted to static `StyleSheet.create` entries
with zero behavior change, same treatment as everything else in P1-7.

**Why it's deferred rather than folded into commit 1:** kept out on purpose
so commit 1's diff stays tightly scoped to what was explicitly planned; this
is a trivial, low-value addition on its own and better swept up alongside
whichever future pass does a final pass over P1-7's leftovers, rather than
silently expanding commit 1's surface.

**Fix (when picked up):** hoist both objects to named `StyleSheet.create`
entries (e.g. `tagPill`, `tagPillText`) — no per-tag variation exists, so no
lookup/variant logic is needed, just a straight static extraction.

---

## recipe.tsx: two near-identical back buttons serve different branches — do not merge

**Status:** Logged 2026-07-26, informational — not a bug, a guardrail against
a future "helpful" cleanup.

**Symptom:** `app/recipe.tsx` has two back-button implementations with
matching literal styles (`{paddingHorizontal:8,paddingVertical:8}` and
`{color:OaklandDusk.brand.gold,fontSize:17}`):
- Module-level, inside `NO_SELECTION_HEADER_OPTIONS` (lines ~75-97): used by
  the `!hasSelection` early-return branch's native header, navigates via the
  `staticRouter` singleton, hardcoded `"‹ Back"` label.
- In-component (lines ~1089-1103): used by the main render's custom nav bar,
  navigates via the local `router` from `useRouter()`, dynamic `‹ {backLabel}`
  (varies by `params.source` — "Favorites"/"Picks"/"Cocktails"/"Back").

**Why they look mergeable but aren't:** identical current pixel values are
coincidental, not structural — different router source (module singleton vs.
hook instance) and different label logic (fixed vs. `backLabel`-driven) mean
a shared style constant or shared component would create false coupling: a
future edit to one (e.g. changing the fixed "Back" label, or adjusting
`backLabel`'s branch logic) would have no reason to also apply to the other,
but a shared abstraction would tempt exactly that.

**Fix:** none needed — this entry exists so P1-7's later commits (or any
future pass) don't "helpfully" deduplicate these into a shared style/component
without realizing the branches are independent.

---

## recipe.tsx: the inline ladder's error branch never fires without the standalone error card also firing

**Status:** Logged 2026-07-26, informational — a redundant duplicate, not
dead code, not fixed. Found while scoping P1-7 commit 3; log-only per scope,
no behavior change bundled into that commit.

**Symptom:** Inside the Ingredients card's 4-way conditional ladder
(`dbRecipe ? <DbIngredientsList/> : loading ? ... : error ? ... : ibaCode ? ... : ...`),
the `error` branch renders "Failed to load recipe: {error}" as a plain
caption line. Immediately below the card, a separate standalone block
renders the same `error` string again, styled as a prominent crimson/rose
card with an "Error" heading. Whenever the inline branch shows, the
standalone card shows the identical message directly underneath it.

**Root cause:** traced via the only two truthy `setError(...)` call sites
in the file. The main recipe-fetch effect sets `error` truthy while *also*
setting `dbRecipe` to `null` in the same branch (both the "Recipe not
found" path and its catch block do this). `createShareAndGo`'s catch block
— invoked via `handleSharePress`'s "Show QR Code" action — sets `error`
truthy *without* touching `dbRecipe`; `handleSharePress` itself opens with
`if (!dbRecipe) return;`, independently guaranteeing `dbRecipe` is already
truthy on every path that reaches this catch. The ladder's `error` arm is
only reachable when `!dbRecipe`; the standalone card's condition is bare
`error` truthy, independent of `dbRecipe`/`loading`.

**Conclusion:** the inline branch is not dead — it fires whenever the main
fetch effect fails. But every condition that reaches it is a strict subset
of the standalone card's condition, so the standalone card always renders
alongside it — the inline text is redundant every time it appears. The
standalone card can fire alone (the share-failure path), where the ladder
stays on the `<DbIngredientsList>` arm and the inline caption never shows.

**Fix (deferred, low priority):** delete the inline `error ?` arm of the
ladder — it can never show without the standalone card already showing the
same message, so the standalone card alone is sufficient. A (trivial)
behavior change, not a pure identity move, so needs a product/design nod —
out of scope for P1-7's mechanical commits.
