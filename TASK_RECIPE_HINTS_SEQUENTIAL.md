# TASK: Recipe Hints Sequential — I Made This → Share → Favorites

## Goal

The three hints on the recipe page should appear one at a time in sequence:
1. "I made this" button (GP_STEP_6) — shows first
2. Share icon (RECIPE_SHARE) — shows after step 1 is dismissed
3. Favorites heart icon (RECIPE_FAV) — shows after step 2 is dismissed

Currently all three show simultaneously on mount. This task changes them to a sequential chain.

## File

`app/recipe.tsx`

## Actions

**1. Replace the hint init useEffect** — find (around line 389-400):

```
  // GP step 6 + standalone share + fav hints
  useEffect(() => {
    isGoldenPathStepReady(6).then((ready) => {
      if (ready) setGpStep6Visible(true);
    });
    isGuideDismissed(GUIDE_KEYS.RECIPE_SHARE).then((dismissed) => {
      if (!dismissed) setShareHintVisible(true);
    });
    isGuideDismissed(GUIDE_KEYS.RECIPE_FAV).then((dismissed) => {
      if (!dismissed) setFavHintVisible(true);
    });
  }, []);
```

Replace with:

```
  // Recipe hints — sequential chain: I made this → Share → Favorites
  // On mount, only show the first hint in the chain that hasn't been dismissed yet.
  useEffect(() => {
    (async () => {
      // Step 1: "I made this" (GP_STEP_6)
      const gpReady = await isGoldenPathStepReady(6);
      if (gpReady) {
        setGpStep6Visible(true);
        return; // Show only this one, wait for dismiss
      }

      // Step 2: Share — only if GP_STEP_6 already dismissed
      const shareDismissed = await isGuideDismissed(GUIDE_KEYS.RECIPE_SHARE);
      if (!shareDismissed) {
        setShareHintVisible(true);
        return; // Show only this one
      }

      // Step 3: Favorites — only if Share already dismissed
      const favDismissed = await isGuideDismissed(GUIDE_KEYS.RECIPE_FAV);
      if (!favDismissed) {
        setFavHintVisible(true);
      }
    })();
  }, []);
```

**2. Show share hint after "I made this" is dismissed** — find the handleMadeDrink function where GP_STEP_6 is dismissed (around line 872-876):

```
  const handleMadeDrink = async () => {
    if (gpStep6Visible) {
      dismissGuide(GUIDE_KEYS.GP_STEP_6);
      setGpStep6Visible(false);
    }
```

Replace with:

```
  const handleMadeDrink = async () => {
    if (gpStep6Visible) {
      dismissGuide(GUIDE_KEYS.GP_STEP_6);
      setGpStep6Visible(false);
      // Chain: show share hint next
      isGuideDismissed(GUIDE_KEYS.RECIPE_SHARE).then((d) => {
        if (!d) setShareHintVisible(true);
      });
    }
```

**3. Show favorites hint after share is dismissed** — find the share button onPress (around line 1196-1201):

```
              <Pressable onPress={() => {
                if (shareHintVisible) {
                  dismissGuide(GUIDE_KEYS.RECIPE_SHARE);
                  setShareHintVisible(false);
                }
                handleSharePress();
              }}
```

Replace with:

```
              <Pressable onPress={() => {
                if (shareHintVisible) {
                  dismissGuide(GUIDE_KEYS.RECIPE_SHARE);
                  setShareHintVisible(false);
                  // Chain: show favorites hint next
                  isGuideDismissed(GUIDE_KEYS.RECIPE_FAV).then((d) => {
                    if (!d) setFavHintVisible(true);
                  });
                }
                handleSharePress();
              }}
```

**4. Also handle GP_STEP_6 overlay dismiss** — the HintBubble on "I made this" has an `onDismiss` callback for when the user taps the overlay (instead of the button). Find (around line 1373):

```
              onDismiss={() => setGpStep6Visible(false)}
```

Replace with:

```
              onDismiss={() => {
                setGpStep6Visible(false);
                // Chain: show share hint next
                isGuideDismissed(GUIDE_KEYS.RECIPE_SHARE).then((d) => {
                  if (!d) setShareHintVisible(true);
                });
              }}
```

**5. Also handle share HintBubble overlay dismiss** — find (around line 1192):

```
              onDismiss={() => setShareHintVisible(false)}
```

Replace with:

```
              onDismiss={() => {
                setShareHintVisible(false);
                // Chain: show favorites hint next
                isGuideDismissed(GUIDE_KEYS.RECIPE_FAV).then((d) => {
                  if (!d) setFavHintVisible(true);
                });
              }}
```

## DO NOT

- Change GuideBubble.tsx (no new keys needed, RECIPE_SHARE and RECIPE_FAV already exist)
- Change the visual appearance of any hint
- Change onToggleFavorite behavior
- Change handleSharePress behavior
- Touch any other files

## Verification

```bash
npx tsc --noEmit
```

## Manual Test

**Full sequence (fresh user):**
1. Reset guides
2. Follow golden path to recipe page (or just open a recipe if GP steps 1-5 already dismissed)
3. **Expected**: only charcoal TAP pulse on "I made this" button — NO pulse on share or heart
4. Tap "I made this" → pulse disappears → sky blue pulse appears on share icon
5. Tap share icon → share pulse disappears → sky blue pulse appears on heart icon
6. Tap heart → heart pulse disappears → recipe added to favorites
7. Open another recipe → no hints (all three permanently dismissed)

**Returning user who already did "I made this" but not share:**
1. Open recipe
2. **Expected**: only share pulse shows (GP_STEP_6 already dismissed, RECIPE_SHARE not yet)

**Returning user who did "I made this" and share but not favorites:**
1. Open recipe
2. **Expected**: only favorites pulse shows

**User who dismissed all three:**
1. Open recipe
2. **Expected**: no pulses at all

## Git

```bash
git add app/recipe.tsx
git commit -m "feat: recipe hints sequential chain — I made this → Share → Favorites

Hints appear one at a time: dismissing one triggers the next.
On mount, only the first undismissed hint in the chain is shown.
Overlay dismiss and button press both advance the chain."
```
