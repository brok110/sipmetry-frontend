# TASK: Fix Golden Path — Done handler stays on Scan for first-time users

## Problem

When a new user follows the golden path (Bartender → "Scan my bottles" → Scan page), after scanning and pressing "Done", the app navigates back to the Bartender's "Anything to avoid?" page instead of staying on the Scan page to show the "Show me recipes" footer.

**Root cause**: The bottom sheet passes `intent=addToBar` when pushing to `/scan`. In the Done handler, `intent === "addToBar"` triggers `router.back()`, which returns to bartender.tsx showing the PagerView (still on the Avoid page).

## Fix

In the Done handler, check if golden path step 4 is still pending. If so, the user is on their first-time journey — stay on the Scan page (`setScanPhase("review")`) so the "Show me recipes" footer appears. Otherwise, `router.back()` as before.

## File

`app/scan.tsx`

## Action

**1. Locate the Done handler** — search for this exact block (around line 845-854):

```
grep -n '"Done"' app/scan.tsx
```

You should find:

```typescript
        {
          text: "Done",
          onPress: () => {
            if (searchParams.intent === "addToBar") {
              router.back();
            } else {
              setScanPhase("review");
            }
          },
        },
```

**2. Replace** the Done block with:

```typescript
        {
          text: "Done",
          onPress: async () => {
            if (searchParams.intent === "addToBar") {
              const gpPending = await isGoldenPathStepReady(4);
              if (gpPending) {
                setScanPhase("review");
              } else {
                router.back();
              }
            } else {
              setScanPhase("review");
            }
          },
        },
```

Note: `onPress` changes from `() =>` to `async () =>`.

**3. Verify import** — confirm that `isGoldenPathStepReady` is already imported at the top of the file. Run:

```
grep -n "isGoldenPathStepReady" app/scan.tsx
```

Expected: the import line should already include it (from the bubble hint system commit). If NOT found, update the GuideBubble import to:

```typescript
import HintBubble, { GUIDE_KEYS, dismissGuide, isGuideDismissed, isGoldenPathStepReady } from "@/components/GuideBubble";
```

## DO NOT

- Change any other Done/navigation logic
- Modify the "Scan More" handler
- Change the `intent=addToBar` param in bartender.tsx
- Touch any other files

## Verification

```bash
npx tsc --noEmit
```

## Manual Test

1. Reset guides: call `resetAllGuides()` from dev menu
2. Open Bartender → swipe to Avoid page → tap "Let's make a drink"
3. Bottom sheet opens → tap "Scan my bottles" (bar is empty)
4. Scan page → tap "Scan bottles" → take photo → ingredients detected
5. "Done" alert appears → tap "Done"
6. **Expected**: stays on Scan page, "Show me recipes" sticky footer appears
7. **Before fix**: navigated back to Bartender "Anything to avoid?" page

Also verify existing behavior is preserved:
1. With bottles already in My Bar → Bartender → "Scan something new" → scan → Done
2. **Expected**: `router.back()` to Bartender (GP step 4 already dismissed or not applicable)

## Git

```bash
git add app/scan.tsx
git commit -m "fix: golden path Done handler stays on scan for first-time users

When intent=addToBar and golden path step 4 is pending,
stay on scan page (setScanPhase review) instead of router.back()
so the Show me recipes footer appears for first-time users."
```
