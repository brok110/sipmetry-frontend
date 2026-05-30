# COLOR_TOKEN_UNIFY_PLAN — bartender gold/text alpha → OaklandDusk (方向 1, Option B)

**Repo:** `~/Projects/sipmetry-20260128` (frontend only)
**File touched:** `app/(tabs)/bartender.tsx` — **this one file only**
**Backend:** not touched.

## Why
`bartender.tsx` already uses `OaklandDusk` for every solid color (brand gold `#C87828`,
text `#F0E4C8`, card, void). Seven residual color refs still come from `V3.colors.*`, whose
gold family is tinted on `#C9A458` (khaki gold) and whose text family is tinted on `#EDE6D6` —
neither matches the OaklandDusk / logo base. This causes a subtle two-tone gold inside single
components (e.g. exploration banner: border tinted `#C9A458`, its text `#C87828`).

**Option B (chosen):** inline the four derived colors as `` `${OaklandDusk.brand.gold}XX` `` /
`` `${OaklandDusk.text.primary}XX` `` — matching the template-literal alpha convention already
used in this file (e.g. `` `${OaklandDusk.brand.gold}52` `` at the EXPLORING watermark,
`` `${OaklandDusk.text.primary}94` `` for textDim). No new tokens; `OaklandDusk.ts` is NOT edited.

Alpha → hex suffix (verified): `1F`=0.122 (12%), `47`=0.278 (28%), `2E`=0.180 (18%), `52`=0.322 (32%).

---

## Stage 1: Inline the 7 V3.colors refs in bartender.tsx
**Goal:** `bartender.tsx` reads zero colors from `V3.colors`; all soft/line/ghost/faint colors
are inline OaklandDusk-based template literals.
**Success Criteria:** `grep -n "V3.colors" app/(tabs)/bartender.tsx` returns nothing; TS compiles;
no visual change beyond the intended gold/text base shift.
**Status:** Not Started

### MAP — make exactly these 7 edits (anchor on the blocks shown to stay unambiguous)

**Edit 1 — `explorationBanner` (2 lines, replace together):**
```diff
-    borderColor: V3.colors.goldLine,        // 28% gold
-    backgroundColor: V3.colors.goldSoft,    // 12% gold
+    borderColor: `${OaklandDusk.brand.gold}47`,        // brand gold @28%
+    backgroundColor: `${OaklandDusk.brand.gold}1F`,    // brand gold @12%
```

**Edit 2 — `filterToggle.borderBottomColor`:**
```diff
-    borderBottomColor: V3.colors.textGhost,   // 18% white
+    borderBottomColor: `${OaklandDusk.text.primary}2E`,   // text primary @18%
```

**Edit 3 — `filterToggleOpen.borderBottomColor` (also fixes the stale `// 18% gold` comment — goldLine is 28%):**
```diff
-    borderBottomColor: V3.colors.goldLine,    // 18% gold
+    borderBottomColor: `${OaklandDusk.brand.gold}47`,    // brand gold @28%
```

**Edit 4 — `chipsLabel.color`:**
```diff
-    color: V3.colors.textFaint,
+    color: `${OaklandDusk.text.primary}52`,
```

**Edit 5 — `chip.borderColor`:**
```diff
-    borderColor: V3.colors.textGhost,
+    borderColor: `${OaklandDusk.text.primary}2E`,
```

**Edit 6 — `chipActive.backgroundColor` (anchor on the full block — `backgroundColor: V3.colors.goldSoft` also appears in Edit 1, so match the 3-line block to disambiguate):**
```diff
   chipActive: {
     borderColor: OaklandDusk.brand.gold,
-    backgroundColor: V3.colors.goldSoft,
+    backgroundColor: `${OaklandDusk.brand.gold}1F`,
   },
```

### Reference — original line numbers (from uploaded bartender.tsx, 1217 lines)
824 goldLine · 825 goldSoft · 1084 textGhost · 1088 goldLine(+stale comment) · 1106 textFaint · 1120 textGhost · 1125 goldSoft

### LEAVE (do not change)
- The `V3` import on line 6 — **still required** for `V3.fonts`, `V3.type`, `V3.spacing`
  (fonts + typography + layout spacing, all still in use). Only the color refs go.
- All existing `` `${OaklandDusk.brand.gold}52` `` / `` `${OaklandDusk.text.primary}94` `` literals.
- `OaklandDusk.bg.void` / `OaklandDusk.bg.card` usages (already on OaklandDusk).
- All layout, logic, JSX, fonts, spacing.

### DO NOT
- Do NOT edit `constants/OaklandDusk.ts` or `constants/v3DesignTokens.ts`.
- Do NOT remove or reorder the `V3` import.
- Do NOT touch `V3.fonts` / `V3.type` / `V3.spacing`.
- Do NOT touch any other file.
- Do NOT change void/card/text base hex values elsewhere.

---

## Verification (Brok runs)
1. `grep -n "V3.colors" app/(tabs)/bartender.tsx` → **no matches**.
2. App compiles / no TS errors (template-literal strings are valid RN color values).
3. Simulator → bartender tab, eyeball these 5 spots (shift is subtle, all 8–32% alpha):
   - Exploration banner: border + fill (starter-bar / empty-inventory mode).
   - Filter toggle underline when **open** (should read as brand-gold hairline).
   - Chip group labels (SPIRIT / OCCASION / STYLE) — faint label text.
   - Inactive chip border.
   - Active chip fill.
4. No regression script needed — frontend only, `server.js` untouched.

## Definition of Done
- [ ] 7 edits applied, comment on Edit 3 corrected
- [ ] `grep V3.colors` clean
- [ ] Compiles, simulator spots look right
- [ ] Commit message explains the base shift (`#C9A458`/`#EDE6D6` tint → OaklandDusk `#C87828`/`#F0E4C8`)

Suggested commit (Brok runs):
`bartender: inline soft/line/ghost colors onto OaklandDusk brand gold + text primary; drop last V3.colors refs`

On completion → archive this file as `COLOR_TOKEN_UNIFY_PLAN_DONE.md`.

---

## Note (out of scope for this task)
This removes all `V3.colors` use from **bartender.tsx only**. If the goal is later to delete the
`colors` block from `v3DesignTokens.ts` entirely, grep the whole repo first to confirm no other
file imports `V3.colors` — not verified here.

---

### Cowork handoff reminder
做完**不要** `git commit` / `git push`。改完回報「7 edits done + grep V3.colors clean」，
commit 由 Brok 自己跑。有任何 `old_str` 對不上（行已位移、註解不同）就停下回報，不要猜。
