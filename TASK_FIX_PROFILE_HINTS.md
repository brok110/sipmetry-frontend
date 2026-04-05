# TASK: Fix Profile Hints — Independent Dismiss for Preferences & Favorites

## Problem

Two issues with Profile tab hints:
1. Hints don't dismiss when tapped (HintBubble overlay clipped by `position: relative` parent)
2. Both hints should be independent — tapping Preferences should only dismiss the Preferences hint, not Favorites

## Fix

1. Split `GUIDE_KEYS.PROFILE_ROWS` into two separate keys: `PROFILE_PREFS_ROW` and `PROFILE_FAVS_ROW`
2. Use two independent states, each row dismisses only its own hint
3. Replace HintBubble with TapPulse-only (row's onPress handles dismiss)

## Files

- `components/GuideBubble.tsx`
- `app/(tabs)/profile.tsx`

## Actions

### GuideBubble.tsx

**1. Add two new keys, keep old one for backwards compat** — find the GUIDE_KEYS object. Locate:

```
  PROFILE_ROWS:  "sipmetry_guide_profile_rows",
  RECIPE_SHARE:  "sipmetry_guide_recipe_share",
```

Replace with:

```
  PROFILE_ROWS:     "sipmetry_guide_profile_rows",
  PROFILE_PREFS_ROW: "sipmetry_guide_profile_prefs_row",
  PROFILE_FAVS_ROW:  "sipmetry_guide_profile_favs_row",
  RECIPE_SHARE:     "sipmetry_guide_recipe_share",
```

### profile.tsx

**2. Update import** — find line 5:

```
import HintBubble, { GUIDE_KEYS, TapPulse, dismissGuide, isGuideDismissed, resetAllGuides } from "@/components/GuideBubble";
```

Replace with:

```
import { GUIDE_KEYS, TapPulse, dismissGuide, isGuideDismissed, resetAllGuides } from "@/components/GuideBubble";
```

**3. Replace state declarations** — find (around line 63-64):

```
  const [guideProfilePrefsVisible, setGuideProfilePrefsVisible] = useState(false);
  const [guideProfileRowsVisible, setGuideProfileRowsVisible] = useState(false);
```

Replace with:

```
  const [guidePrefsRowVisible, setGuidePrefsRowVisible] = useState(false);
  const [guideFavsRowVisible, setGuideFavsRowVisible] = useState(false);
```

**4. Replace useEffect init** — find (around line 66-70):

```
  useEffect(() => {
    isGuideDismissed(GUIDE_KEYS.PROFILE_PREFS).then((d) => setGuideProfilePrefsVisible(!d));
    isGuideDismissed(GUIDE_KEYS.PROFILE_ROWS).then((d) => {
      if (!d) setGuideProfileRowsVisible(true);
    });
  }, []);
```

Replace with:

```
  useEffect(() => {
    isGuideDismissed(GUIDE_KEYS.PROFILE_PREFS_ROW).then((d) => {
      if (!d) setGuidePrefsRowVisible(true);
    });
    isGuideDismissed(GUIDE_KEYS.PROFILE_FAVS_ROW).then((d) => {
      if (!d) setGuideFavsRowVisible(true);
    });
  }, []);
```

**5. Replace the Preferences row block** — find the entire Preferences `<View style={{ position: "relative" }}>` block (around line 155-170):

```
        <View style={{ position: "relative" }}>
          <HintBubble
            storageKey={GUIDE_KEYS.PROFILE_ROWS}
            visible={guideProfileRowsVisible}
            onDismiss={() => {
              setGuideProfileRowsVisible(false);
              dismissGuide(GUIDE_KEYS.PROFILE_ROWS);
            }}
            hintType="tap"
            hintColor="skyblue"
          />
          <ProfileRow
            icon="sliders"
            label="Preferences"
            onPress={() => {
              dismissGuide(GUIDE_KEYS.PROFILE_PREFS);
              setGuideProfilePrefsVisible(false);
              router.push("/profile/preferences");
            }}
          />
        </View>
```

Replace with:

```
        <View style={{ position: "relative" }}>
          {guidePrefsRowVisible && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 100 }} pointerEvents="none">
              <TapPulse color="skyblue" />
            </View>
          )}
          <ProfileRow
            icon="sliders"
            label="Preferences"
            onPress={() => {
              if (guidePrefsRowVisible) {
                setGuidePrefsRowVisible(false);
                dismissGuide(GUIDE_KEYS.PROFILE_PREFS_ROW);
              }
              router.push("/profile/preferences");
            }}
          />
        </View>
```

**6. Replace the Favorites row block** — find the entire Favorites `<View style={{ position: "relative" }}>` block (around line 171-183):

```
        <View style={{ position: "relative" }}>
          {guideProfileRowsVisible && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 100 }} pointerEvents="none">
              <TapPulse color="skyblue" />
            </View>
          )}
          <ProfileRow
            icon="heart"
            label="Favorites"
            onPress={() => router.push("/profile/favorites")}
          />
        </View>
```

Replace with:

```
        <View style={{ position: "relative" }}>
          {guideFavsRowVisible && (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 100 }} pointerEvents="none">
              <TapPulse color="skyblue" />
            </View>
          )}
          <ProfileRow
            icon="heart"
            label="Favorites"
            onPress={() => {
              if (guideFavsRowVisible) {
                setGuideFavsRowVisible(false);
                dismissGuide(GUIDE_KEYS.PROFILE_FAVS_ROW);
              }
              router.push("/profile/favorites");
            }}
          />
        </View>
```

## DO NOT

- Remove the old `PROFILE_ROWS` key from GUIDE_KEYS (keep for backwards compat / resetAllGuides)
- Change any other profile rows, navigation, or screens
- Modify HintBubble or TapPulse component internals

## Verification

```bash
npx tsc --noEmit
```

## Manual Test

1. Reset guides via DEV button on Profile page
2. Navigate away, return to Profile tab
3. **Expected**: sky blue TAP pulses on BOTH Preferences and Favorites rows
4. Tap Preferences → Preferences pulse disappears, Favorites pulse remains, navigates to Preferences
5. Go back to Profile → only Favorites pulse showing
6. Tap Favorites → Favorites pulse disappears, navigates to Favorites
7. Go back to Profile → no pulses, permanently dismissed

## Git

```bash
git add components/GuideBubble.tsx app/(tabs)/profile.tsx
git commit -m "fix: profile hints dismiss independently

Split PROFILE_ROWS into PROFILE_PREFS_ROW + PROFILE_FAVS_ROW.
Each row has its own AsyncStorage key and state.
Tapping Preferences only dismisses Preferences hint.
Replaced HintBubble with TapPulse — row onPress handles dismiss."
```
