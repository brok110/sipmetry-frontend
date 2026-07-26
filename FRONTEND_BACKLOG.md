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

**Status:** Logged only. Nothing changed. Batch 1 (zero-risk + pure
deletion) is ready to execute but deliberately deferred by Brok.

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
boundaries. Ship that batch, re-measure, and only then decide on P0-1b /
P0-1c / P0-2.

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
