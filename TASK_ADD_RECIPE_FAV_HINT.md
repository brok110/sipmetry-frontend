# TASK: Add Favorites TAP Hint on Recipe Page (Independent from Share)

## Goal

Add a sky blue TAP hint on the favorites (heart) icon in the recipe detail page. It must be independent from the share hint — dismissing one does not dismiss the other.

## Files

- `components/GuideBubble.tsx`
- `app/recipe.tsx`

## Actions

### GuideBubble.tsx

**1. Add new key** — find the GUIDE_KEYS object. Locate:

```
  RECIPE_SHARE:     "sipmetry_guide_recipe_share",
```

Add after it:

```
  RECIPE_FAV:       "sipmetry_guide_recipe_fav",
```

### recipe.tsx

**2. Add state** — find (around line 382):

```
  const [shareHintVisible, setShareHintVisible] = useState(false);
```

Add after:

```
  const [favHintVisible, setFavHintVisible] = useState(false);
```

**3. Init on mount** — find the useEffect that inits share hint (around line 388-396):

```
  // GP step 6 + standalone share hint
  useEffect(() => {
    isGoldenPathStepReady(6).then((ready) => {
      if (ready) setGpStep6Visible(true);
    });
    isGuideDismissed(GUIDE_KEYS.RECIPE_SHARE).then((dismissed) => {
      if (!dismissed) setShareHintVisible(true);
    });
  }, []);
```

Replace with:

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

**4. Add TapPulse to favorites button + dismiss on press** — find the favorites Pressable (around line 1204-1206):

```
          <Pressable onPress={onToggleFavorite} hitSlop={10} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
            <FontAwesome name={isFav ? "heart" : "heart-o"} color={isFav ? OaklandDusk.accent.crimson : OaklandDusk.text.tertiary} size={20} />
          </Pressable>
```

Replace with:

```
          <View style={{ position: "relative" }}>
            {favHintVisible && !isFav && (
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 100 }} pointerEvents="none">
                <TapPulse color="skyblue" />
              </View>
            )}
            <Pressable onPress={() => {
              if (favHintVisible) {
                setFavHintVisible(false);
                dismissGuide(GUIDE_KEYS.RECIPE_FAV);
              }
              onToggleFavorite();
            }} hitSlop={10} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
              <FontAwesome name={isFav ? "heart" : "heart-o"} color={isFav ? OaklandDusk.accent.crimson : OaklandDusk.text.tertiary} size={20} />
            </Pressable>
          </View>
```

Note: The pulse only shows when `!isFav` — if the recipe is already favorited, no hint needed.

**5. Add TapPulse import** — find the import line (line 2):

```
import HintBubble, { GUIDE_KEYS, dismissGuide, isGoldenPathStepReady, isGuideDismissed } from "@/components/GuideBubble";
```

Replace with:

```
import HintBubble, { GUIDE_KEYS, TapPulse, dismissGuide, isGoldenPathStepReady, isGuideDismissed } from "@/components/GuideBubble";
```

## DO NOT

- Change the share hint logic — it must remain independent
- Change `onToggleFavorite` behavior beyond adding the dismiss call
- Touch GP step 6 ("I made this") logic

## Verification

```bash
npx tsc --noEmit
```

## Manual Test

1. Reset guides
2. Open any recipe detail
3. **Expected**: sky blue TAP pulse on share icon AND on heart icon (both showing)
4. Tap share icon → share pulse disappears, heart pulse remains
5. Tap heart icon → heart pulse disappears, recipe added to favorites
6. Leave and open another recipe → no pulses (both permanently dismissed)

Alternative path:
1. Reset guides, open recipe
2. Tap heart first → heart pulse disappears, share pulse remains
3. Tap share → share pulse disappears

## Git

```bash
git add components/GuideBubble.tsx app/recipe.tsx
git commit -m "feat: add independent favorites TAP hint on recipe page

New RECIPE_FAV guide key, independent from RECIPE_SHARE.
Sky blue TapPulse on heart icon, only shows when not yet favorited.
Each hint dismisses independently on tap."
```
