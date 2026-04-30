# 4D — Frontend input validation gap

**Parent:** Round 4 ontology debt cleanup (audit: `ONTOLOGY_DEBT_AUDIT_2026-04.md`)
**Repos:** sipmetry-backend-20260122 + sipmetry-20260128 (cross-repo)
**Scope:** Close the `user_inventory` pollution path. User-typed free-text currently bypasses all server-side allowlist enforcement; backend has the infrastructure (`loadIngredientKeys`, alias map) but isn't wired up; frontend has no way to query the allowlist.
**Estimated effort:** 3-5 hours
**Risk:** medium (backward compat across versioned mobile clients)
**Executor:** Cowork (cross-repo coordination, multiple files per stage)

---

## Context

Audit §3.1 listed two known dirty rows in `user_inventory`:
- `liqueur` (1 user) — bare category, meaningless as ingredient
- `simple_surup` (1 user) — pure typo, intended `simple_syrup`

Original audit §4.3 attributed this to "no frontend input validation." Stage 0 of this plan dug into the actual code path and found a deeper gap:

1. `app/scan.tsx:2084` exposes a free-text TextInput (no autocomplete, no client-side allowlist)
2. Client-side normalization (`resolveCanonicalForDisplay` at `scan.tsx:1057`) does only regex-level snake_case, **never consults server allowlist** — historical comment notes the previous `/debug/canonicalize` endpoint was removed for security
3. `POST /inventory` (server.js:5172) does extensive normalization (alias resolve + snake_case + display canonicalize) but **never rejects unknown keys**
4. `loadIngredientKeys` function exists at server.js:1096 with cache + TTL infrastructure, but has **zero callers** — dead infrastructure ready to wire up
5. Alias table has 87 verified rows split: 39 spaced→snake (e.g. `"lime juice" → "lime_juice"`), 39 identity (e.g. `"amaro_nonino" → "amaro_nonino"`, used as canonical-key whitelist registration), 9 alternative-name (e.g. `"golden_rum" → "gold_rum"`)

The audit framing of "missing manual entry validation" is correct in spirit but the actual fix involves four moving pieces: new endpoint, server validation, frontend allowlist fetch, frontend UI rewrite — not just one client-side gate.

---

## Stage 0 — Reconnaissance

**Status:** ✅ Complete 2026-04-29 (this chat session)

### Findings carried forward

| Aspect | Reality | Plan implication |
|---|---|---|
| Manual add UI | Single free-text TextInput at `scan.tsx:2084` | Replace with autocomplete (Stage 4) |
| Client canonicalization | Pure regex, no server interaction | Add server fetch (Stage 3) |
| Server `POST /inventory` validation | Normalizes but doesn't reject | Add allowlist check (Stage 2) |
| `loadIngredientKeys` callers | Zero | Wire up via new endpoint (Stage 1) |
| Alias coverage | 87 rows, 39 spaced→snake + 39 identity + 9 alternative | Stage 2 reject logic must `resolveIngredientKey()` BEFORE allowlist check |
| Existing dirty rows | 2 (`liqueur`, `simple_surup`) | Stage 5 cleanup |

### Cross-repo coordination decision

Ship in two coordinated commits (one per repo), Stage 1+2+5 in backend first, Stage 3+4 in frontend second. Stage 2 ships in **soft-reject mode** (log only, accept anyway) so the version-mismatch window between backend deploy and TestFlight rollout doesn't break legacy clients. Hard-reject conversion is a deliberate later flip, not part of this plan.

---

## Stage 1 — Backend: `GET /ingredient-keys` endpoint

**Goal:** Expose the allowlist that already exists in memory (`loadIngredientKeys` + alias map) via an authenticated GET endpoint. Frontend will fetch this once at session start, cache it, and use it for client-side validation.

**File:** `server.js` (sipmetry-backend-20260122)

### Endpoint shape

```
GET /ingredient-keys
Authorization: Bearer <user JWT>
Response 200:
{
  "version": "2026-04-29T12:34:56.000Z",     // server-side cache load timestamp
  "canonical_keys": ["aged_rum", "agave_syrup", ...],  // from ingredients.ingredient_key
  "aliases": {
    "lime juice": "lime_juice",
    "aged rum": "aged_rum",
    "golden_rum": "gold_rum",
    ...
  }
}
```

Rationale for two-tier shape (canonical + aliases):
- Frontend autocomplete dropdown can show user-friendly forms (`"lime juice"`) but submit canonical (`"lime_juice"`)
- Frontend can match user's partial input against either canonical keys OR alias keys
- Server already has both data sources (ingredients table + ontology alias rows); cheap to expose both
- Plain flat array would force frontend to re-derive aliases or skip user-friendly UX

### Actions

1. Locate insertion point near other `/inventory` family endpoints (around line 5170, before `app.post("/inventory", ...)`).

2. Add helper function to load aliases (mirrors existing `refreshOntologyAliasMap` but returns the raw map data instead of mutating module state):
   ```js
   // Cache alongside _ingredientKeysCache. Reuses the same TTL.
   let _aliasMapForExportCache = null;
   let _aliasMapForExportCacheTime = 0;
   
   async function loadAliasMapForExport() {
     const now = Date.now();
     if (_aliasMapForExportCache && now - _aliasMapForExportCacheTime < INGREDIENT_KEYS_CACHE_TTL) {
       return _aliasMapForExportCache;
     }
     try {
       const result = await pool.query(`
         SELECT ingredient_key, value
         FROM public.ingredient_ontology
         WHERE relation_type = 'alias' AND verified = true
       `);
       const obj = {};
       for (const r of result.rows) {
         obj[r.ingredient_key] = r.value;
       }
       _aliasMapForExportCache = obj;
       _aliasMapForExportCacheTime = now;
       log(`[loadAliasMapForExport] loaded ${result.rows.length} aliases`);
       return obj;
     } catch (err) {
       console.error("[loadAliasMapForExport] error:", err.message);
       return _aliasMapForExportCache || {};
     }
   }
   ```

3. Add endpoint:
   ```js
   app.get("/ingredient-keys", requireAuth, async (req, res) => {
     try {
       if (!pool) return res.status(500).json({ error: "service_unavailable" });
       
       const [keys, aliases] = await Promise.all([
         loadIngredientKeys(),
         loadAliasMapForExport(),
       ]);
       
       // Cache load timestamp helps clients decide whether to refetch
       const version = new Date(_ingredientKeysCacheTime || Date.now()).toISOString();
       
       return res.json({
         version,
         canonical_keys: keys,
         aliases,
       });
     } catch (err) {
       console.error("[GET /ingredient-keys] error:", err.message);
       return res.status(500).json({ error: "service_unavailable" });
     }
   });
   ```

4. Add HTTP cache headers if appropriate. Per session memory: alias map refreshes every 12 hours, ingredients keys 5 min. Conservative: `Cache-Control: private, max-age=300` (5 min, aligned with shorter TTL).

### Tests

- `node --check server.js`
- Manual: with auth token, `curl https://<deploy-url>/ingredient-keys -H "Authorization: Bearer ..."`
  - Verify 200, JSON shape matches above
  - Verify `canonical_keys.length` ≈ count of `ingredients` table (run `SELECT COUNT(*) FROM ingredients` to compare)
  - Verify `Object.keys(aliases).length` === 87 (current alias count)
- Without auth: 401

### Risk / mitigation

- **Risk:** Endpoint payload size. 200-300 ingredients × ~20 char keys + 87 aliases ≈ ~10-20 KB. Acceptable for once-per-session fetch.
- **Mitigation:** Add optional `?since=<ISO>` query param later if payload grows. Out of scope for this stage.

**Status:** Not Started

---

## Stage 2 — Backend: `POST /inventory` soft-reject + log

**Goal:** After existing normalization (alias resolve + snake_case + display canonicalize), check whether the resolved key exists in `ingredients` table OR in alias map. If neither, **log warning but still accept**. This populates Render logs with real-world unknown-key data, informing the eventual hard-reject flip.

**File:** `server.js` (sipmetry-backend-20260122)

### Why soft, not hard

If we hard-reject today:
- TestFlight build ≤ 15 (Apr 15) — no client-side autocomplete, will send any free-text → 400 → user sees "Add ingredient" button do nothing → mystery bug
- TestFlight build ≥ 16 (post-Stage 4) — client-side autocomplete already filters, server reject catches only edge cases

Soft-reject for 2-4 weeks lets us:
- Confirm no surprise rejection patterns in real user input
- Validate the allowlist is comprehensive enough (if `[inventory POST] UNKNOWN_KEY` floods logs with reasonable inputs, our allowlist has gaps to fill before hard-reject)
- Hard-reject flip is a one-line change later (see "Future hardening" below)

### Actions

1. Locate `POST /inventory` handler at line 5172. After existing canonicalization block (after line ~5215 where `canonFromDisplay` override completes, before the `vol = Math.round(...)` line), insert:

   ```js
   // 4D Stage 2: soft-reject unknown keys.
   // If resolvedKey is not in ingredients table AND not a known alias,
   // log warning. Hard-reject planned for later iteration once
   // unknown-key patterns from logs are reviewed.
   try {
     const knownKeys = await loadIngredientKeys();
     const aliasMap = await loadAliasMapForExport();
     const isKnown = knownKeys.includes(resolvedKey) || (resolvedKey in aliasMap);
     if (!isKnown) {
       console.warn(
         `[inventory POST] UNKNOWN_KEY user=${req.user?.id} raw="${rawKey}" resolved="${resolvedKey}" display="${display_name}"`
       );
       // Soft mode: continue. Hard mode flip:
       //   return res.status(400).json({ error: "unknown_ingredient_key", detail: "..." });
     }
   } catch (err) {
     // Allowlist load failure should never block POST /inventory.
     console.error("[inventory POST] allowlist check failed (non-blocking):", err.message);
   }
   ```

2. Confirm log line format is greppable: `grep "UNKNOWN_KEY" render.log | wc -l` should give clean count.

### Tests

- `node --check server.js`
- Manual smoke (after deploy):
  - Submit valid key (`"lime_juice"`) via existing TestFlight build → expect normal accept, no warning
  - Submit known alias (`"lime juice"`) → resolves to `"lime_juice"` → no warning
  - Submit garbage (`"liqueur"` or random `"asdfasdf"`) → expect accept (200) + Render log `[inventory POST] UNKNOWN_KEY ... resolved="liqueur"`

### Risk / mitigation

- **Risk:** Allowlist load failure blocks legitimate writes.
- **Mitigation:** try/catch wrapper around the check (shown above). Allowlist failure logs error but `isKnown` defaults to letting write proceed.
- **Risk:** Log spam if allowlist has gaps.
- **Mitigation:** That's the entire point of soft mode — surface gaps before they become hard 400s.

**Status:** Not Started

---

## Stage 3 — Frontend: allowlist hook + cache

**Goal:** Build a React Native hook/context that fetches `/ingredient-keys` once per session, caches the result in memory, and exposes lookup + filter helpers to UI components.

**Files:** `sipmetry-20260128/context/ingredientKeys.tsx` (new) + integration in `app/_layout.tsx`

### Hook shape

```tsx
// context/ingredientKeys.tsx
type IngredientKeysData = {
  version: string;
  canonical_keys: string[];
  aliases: Record<string, string>;       // input → canonical
  isLoaded: boolean;
};

const IngredientKeysContext = createContext<{
  data: IngredientKeysData;
  resolve: (input: string) => string | null;   // returns canonical, or null if unknown
  filter: (query: string, limit?: number) => Array<{ display: string; canonical: string }>;
}>({ ... });

export function IngredientKeysProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [data, setData] = useState<IngredientKeysData>({
    version: "",
    canonical_keys: [],
    aliases: {},
    isLoaded: false,
  });
  
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    apiFetch("/ingredient-keys", { session })
      .then(json => {
        if (cancelled) return;
        setData({ ...json, isLoaded: true });
      })
      .catch(err => {
        console.warn("[ingredientKeys] fetch failed:", err.message);
      });
    return () => { cancelled = true; };
  }, [session]);
  
  // ... resolve + filter helpers
}
```

### Actions

1. Create `context/ingredientKeys.tsx` with the provider + hook.

2. Wrap `<IngredientKeysProvider>` inside `<AuthProvider>` (or wherever the existing nested providers live in `app/_layout.tsx`). Order matters — needs `useAuth()`.

3. Implement `resolve(input)`:
   - Lowercase + trim
   - Check if input is canonical key (return as-is)
   - Check if input is in aliases (return mapped value)
   - Return null otherwise

4. Implement `filter(query, limit=20)`:
   - Lowercase + trim query
   - Match against both canonical_keys AND aliases keys (substring or starts-with)
   - Return [{ display, canonical }] pairs, ranked: starts-with > contains
   - For aliases, `display = aliasKey`, `canonical = aliasMap[aliasKey]`
   - Dedupe by canonical so the dropdown doesn't show 3 entries for the same canonical with different display variants

5. Handle gracefully when `isLoaded === false` (still fetching) or fetch failed:
   - `resolve` should return `null` (so UI shows "still loading" or "unknown")
   - `filter` should return empty array

### Tests

- TypeScript compiles (`npx tsc --noEmit`)
- App boots without errors
- React DevTools / console: confirm `IngredientKeysProvider` mounted and `data.isLoaded === true` after auth + fetch settles
- Spot test in any temporary `console.log`:
  ```ts
  console.log(resolve("lime juice"));    // "lime_juice"
  console.log(resolve("liqueur"));        // null
  console.log(filter("rum", 5));         // [{display: "white rum", canonical: "white_rum"}, ...]
  ```

**Status:** Not Started

---

## Stage 4 — Frontend: scan.tsx Add UI rewrite

**Goal:** Replace the bare TextInput at `scan.tsx:2084-2117` with an autocomplete-style picker that:
- Shows matching ingredients as user types (uses Stage 3 `filter()`)
- Submits ONLY when user picks a real entry (no free-text submission)
- Falls back gracefully if allowlist hasn't loaded (disable input, show small loading hint)

**Files:** `sipmetry-20260128/app/scan.tsx` (lines ~2084-2117) + helpers if extracted

### UX behavior

| Input state | Behavior |
|---|---|
| Allowlist not loaded yet | Input disabled, placeholder "Loading…" |
| Empty input | Input enabled, placeholder unchanged (`'e.g., "simple syrup"'`), no dropdown |
| Typing 1+ chars | Show dropdown of up to 8 filtered matches |
| User taps dropdown item | Fill input with display name, store canonical in pending state |
| User presses Add (with valid pending canonical) | Existing `addIngredient` flow runs, canonical pre-set |
| User presses Add without picking from dropdown (free text) | Show small inline error "Pick from list" — Add button stays disabled |

### Actions

1. Refactor `addIngredient` (line 1583-1620) to accept a pre-resolved canonical:
   ```ts
   const addIngredient = async (preResolved?: { display: string; canonical: string }) => {
     const v = preResolved?.display ?? newIngredient.trim();
     if (!v) return;
     // ... existing dedupe + state push ...
     // Skip resolveCanonicalForDisplay if preResolved given:
     const canon = preResolved?.canonical ?? await resolveCanonicalForDisplay(v);
     // ... rest unchanged ...
   };
   ```

2. Add new state for selection tracking:
   ```ts
   const [pickedCanonical, setPickedCanonical] = useState<string | null>(null);
   const ingredientKeys = useIngredientKeys();
   const filtered = newIngredient.trim().length > 0
     ? ingredientKeys.filter(newIngredient, 8)
     : [];
   ```

3. Replace TextInput + Pressable block (line 2084-2117) with TextInput + dropdown + Pressable:
   ```tsx
   <View>
     <Text style={...}>Add ingredient</Text>
     <TextInput
       value={newIngredient}
       onChangeText={(text) => {
         setNewIngredient(text);
         setPickedCanonical(null);  // reset picked on edit
       }}
       editable={ingredientKeys.data.isLoaded}
       placeholder={ingredientKeys.data.isLoaded ? 'e.g., "simple syrup"' : 'Loading…'}
       ...
     />
     {filtered.length > 0 && pickedCanonical === null && (
       <View style={{ /* dropdown styling, OaklandDusk theme */ }}>
         {filtered.map(item => (
           <Pressable key={item.canonical} onPress={() => {
             setNewIngredient(item.display);
             setPickedCanonical(item.canonical);
           }}>
             <Text style={...}>{item.display}</Text>
           </Pressable>
         ))}
       </View>
     )}
     <Pressable
       onPress={() => addIngredient(
         pickedCanonical ? { display: newIngredient.trim(), canonical: pickedCanonical } : undefined
       )}
       disabled={loading || !pickedCanonical}
       style={{ ... opacity: pickedCanonical ? 1 : 0.4 ... }}
     >
       <Text>{isZh ? "加入" : "Add"}</Text>
     </Pressable>
     {newIngredient.trim().length > 0 && pickedCanonical === null && filtered.length === 0 && (
       <Text style={{ fontSize: 11, color: OaklandDusk.brand.crimson }}>
         {isZh ? "找不到此原料" : "Not a recognized ingredient"}
       </Text>
     )}
   </View>
   ```

4. Style dropdown per OaklandDusk tokens. Refer to existing surfaces for colour/border choices. Defer pixel polish to a follow-up if needed.

5. Handle the two other callers of `resolveCanonicalForDisplay` (line 1106, line 1775):
   - These are NOT free-text user entry points; they're scan AI result + edit-correction flows
   - For now, leave them unchanged. They go through scan path which has its own separate validation considerations (see future-work note)

### Tests

- `npx tsc --noEmit` passes
- App runs in Expo Go / TestFlight
- Smoke test:
  - Open scan tab, before scanning, type "lime" → dropdown shows "lime juice", "lime wedge", etc.
  - Tap "lime juice" → input fills, Add enabled
  - Press Add → ingredient appears in list with canonical `"lime_juice"`
  - Type "asdfasdf" → dropdown empty, error message shows, Add disabled
  - Type "liqueur" → dropdown empty (since `"liqueur"` is not a key), error shows, Add disabled

### Risk / mitigation

- **Risk:** Dropdown UX feels clunky on small screens.
- **Mitigation:** Limit to 8 entries; max-height with scroll; dismiss on outside tap. Iterate based on feel.
- **Risk:** User wants to add something not in allowlist (legitimate new ingredient).
- **Mitigation:** Out of scope for 4d. The "request new ingredient" flow is a separate feature consideration. For now, real new-ingredient additions go through scan path (which does AI ontology gap-fill).

**Status:** Not Started

---

## Stage 5 — DB cleanup of existing dirty rows

**Goal:** Fix the two known dirty rows in `user_inventory`. Manual SQL via Supabase SQL Editor — not part of the deploy commit, ship coordinated alongside backend deploy.

### Pre-flight

```sql
-- Confirm both rows still present
SELECT user_id, ingredient_key, display_name, created_at
FROM public.user_inventory
WHERE ingredient_key IN ('liqueur', 'simple_surup');

-- Expected: 2 rows
```

### Actions

```sql
-- Migration in single transaction
BEGIN;

-- 5a: simple_surup is a typo of simple_syrup. Update key to canonical.
--     simple_syrup is in ingredients table → safe target.
UPDATE public.user_inventory
SET ingredient_key = 'simple_syrup'
WHERE ingredient_key = 'simple_surup';
-- Expected: 1 row affected

-- 5b: liqueur is bare category, no valid canonical target. Delete.
--     User can re-add a specific liqueur via scan path if they want.
DELETE FROM public.user_inventory
WHERE ingredient_key = 'liqueur';
-- Expected: 1 row affected

-- Verify
SELECT user_id, ingredient_key, display_name
FROM public.user_inventory
WHERE ingredient_key IN ('liqueur', 'simple_surup');
-- Expected: 0 rows

COMMIT;
```

If verification returns rows, `ROLLBACK;` and reassess.

### Risk / mitigation

- **Risk:** Affected user may be confused that their `liqueur` entry vanished.
- **Mitigation:** The user is one of Brok's test accounts (per audit user_count = 1). Risk effectively zero.

**Status:** Not Started

---

## Stage 6 — Verify + ship

**Goal:** Coordinated deploy. Backend ships first (Stages 1+2 + DB Stage 5), then frontend (Stages 3+4) once backend deploy is confirmed live.

### Backend ship sequence

1. Run regression suite:
   ```bash
   cd ~/Projects/sipmetry-backend-20260122
   ./run_regression.sh
   ```
   Expect: same warning count as before (4d does not touch ontology checks).

2. Commit + push backend changes:
   ```bash
   rm -f .git/index.lock .git/HEAD.lock
   git add server.js 4D_INPUT_VALIDATION_PLAN.md
   git commit -m "feat(R4-4d): inventory input validation backend

GET /ingredient-keys: expose canonical keys + alias map for client-side
allowlist (loadIngredientKeys was previously dead infrastructure; this
wires it up to a new authenticated endpoint).

POST /inventory: soft-reject unknown keys with [inventory POST] UNKNOWN_KEY
log line. Hard-reject deferred until Render log review confirms allowlist
is comprehensive enough.

See 4D_INPUT_VALIDATION_PLAN.md Stage 1-2 for design rationale."
   git push
   ```

3. Wait for Render auto-deploy to complete. Verify endpoint live:
   ```bash
   curl https://<your-render-url>/ingredient-keys -H "Authorization: Bearer <test token>" | jq '.canonical_keys | length'
   # expect: realistic count (~200-300)
   ```

4. Apply Stage 5 migration via Supabase SQL Editor.

### Frontend ship sequence (after backend confirmed live)

1. Type-check + boot:
   ```bash
   cd ~/Projects/sipmetry-20260128
   npx tsc --noEmit
   npx expo start  # smoke-test scan flow manually
   ```

2. Smoke-test scenarios:
   - Open scan tab as logged-in user
   - Confirm dropdown populates after a moment (allowlist loaded)
   - Type "lime", tap "lime juice", press Add → ingredient added with canonical `lime_juice`
   - Type "qwerty", confirm Add disabled + error message
   - Restart app, repeat — confirm allowlist re-fetches per session

3. Commit + push frontend:
   ```bash
   rm -f .git/index.lock .git/HEAD.lock
   git add context/ingredientKeys.tsx app/_layout.tsx app/scan.tsx 4D_INPUT_VALIDATION_PLAN.md
   git commit -m "feat(R4-4d): inventory input autocomplete + client allowlist

Replace free-text TextInput at scan.tsx:2084 with autocomplete dropdown
backed by /ingredient-keys allowlist. New ingredientKeys context fetches
once per session, exposes resolve() + filter() helpers.

Free-text submission no longer possible — Add button stays disabled until
user picks a known canonical from dropdown.

Backend soft-reject (Stage 2) remains in place to catch any edge cases
the client allowlist misses.

See 4D_INPUT_VALIDATION_PLAN.md Stage 3-4 for design rationale."
   git push
   ```

4. EAS publish OTA bundle for next TestFlight build.

### Final verification

After OTA delivered to a TestFlight build with `expo-updates` (build ≥ 16):
- Open scan tab, confirm autocomplete works
- Submit inventory item, check Render log — expect no `UNKNOWN_KEY` warnings
- Try forcibly submitting a junk key (e.g. via debugger) — expect Render log entry but successful 200 (soft-reject behavior confirmed)

**Status:** Not Started

---

## Future hardening (not part of 4d)

After 2-4 weeks of soft-reject observation:

1. **Hard-reject flip.** Replace the soft-mode `console.warn` block in `POST /inventory` with `return res.status(400).json({ error: "unknown_ingredient_key", ... });`. Single-line change.

2. **`/analyze-image` allowlist gating.** Audit Stage 0 finding (b): scan AI output also bypasses allowlist before hitting `POST /inventory`. AI may suggest novel keys via the `handleOntologyGap` pipeline; need to decide whether ontology gap fill should automatically expand the allowlist or whether it should require manual `verified=true` first. Logged as separate sub-item.

3. **`resolveCanonicalForDisplay` simplification.** With server allowlist available client-side, the `inferCanonicalFromDisplay` + `normalizeIngredientKey` two-step in `scan.tsx:1057` becomes legacy. Could be replaced by a thin wrapper around the new `resolve()` helper. Not blocking, but cleanup opportunity.

4. **Ingredient request flow.** If real users hit "not recognized" frequently for legitimate ingredients (visible in Render logs), build a "request to add" UX. Punt until soft-mode logs justify it.

---

## Log

| Date | Action |
|---|---|
| 2026-04-29 | Plan doc written; Stage 0 reconnaissance complete in claude.ai chat |
| 2026-04-29 | Cross-repo coordination decision: ship backend first, frontend second; soft-reject mode for backward compat |

---

## Notes for executor (Cowork)

- This plan is cross-repo by design. Keep both repos open during execution; some stages reference the other repo's behavior.
- Stage 1 endpoint shape is locked (see "Endpoint shape" section). Frontend Stage 3 implementation must consume that exact shape; do not let the two diverge.
- Soft-reject (Stage 2) is **deliberately** non-blocking. Do not "fix" it to hard-reject during execution. The flip is an explicit later decision based on log observations.
- Do not delete `_ingredientKeysCache` infrastructure — Stage 1 wires it up after long dormancy, and Stage 2 reuses it.
- Stage 5 SQL migration runs manually via Supabase SQL Editor, NOT via committed migration file. Brok runs it; Cowork does not have DB credentials.
- Each stage requires Brok's confirmation before proceeding. Do not chain stages.
- Plan archive (rename `_PLAN.md` → `_DONE.md`) happens at end of Stage 6 in BOTH repos.
- If `npx tsc --noEmit` fails on frontend after Stage 3 or 4, do not commit until fixed. No `--no-verify`.
- Render auto-deploy may take 5-10 minutes after backend push. Wait for confirmation before frontend ship.
