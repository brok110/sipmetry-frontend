# Recommendation Pipeline

## Scope

This document describes the recommendation input pipeline in [app/(tabs)/scan.tsx](/Users/brok/Projects/sipmetry-20260128/app/(tabs)/scan.tsx), from image scan through the final `/recommend-classics` request payload.

## 1. Image Scan to Ingredient Detection

The scan flow starts with an image selected from:
- camera
- photo library

The image is preprocessed client-side with `expo-image-manipulator` before upload:
- resized
- JPEG-compressed
- converted to base64

The app then sends the image to:
- `POST /analyze-image`

The analyze response is normalized into `activeIngredients`, where each item contains:
- `display`
- `canonical`
- `isUserAdded`

`activeIngredients` is the editable working set used by recommendation generation.

## 2. Canonicalization

Before calling the recommendation engine, scan resolves every ingredient to a canonical ingredient key.

Source inputs:
- AI-detected ingredients from `activeIngredients`
- provider-backed inventory ingredient keys from My Bar

Canonicalization rules:
- every candidate is passed through `normalizeIngredientKey()`
- scan ingredients with a missing canonical key are resolved via `resolveCanonicalForDisplay(...)`
- the result is normalized again before use

The scan pipeline uses a dedicated helper to ensure recommendation inputs always go through canonical normalization before they are sent downstream.

## 3. Filtering Invalid Ingredients

If an ingredient cannot be canonicalized:
- it is excluded from the recommendation input
- `console.warn(...)` is emitted for debugging

This applies to:
- scanned ingredients
- inventory ingredient keys

The recommendation engine therefore only receives canonical ingredient keys that survived normalization.

## 4. Dedupe

After canonicalization, ingredient keys are deduped.

The merged set combines:
- canonicalized scanned ingredients
- canonicalized inventory keys from My Bar

Dedupe happens after normalization so aliases or differently formatted inputs collapse onto a single canonical key.

## 5. Deterministic Ordering

After canonicalization and dedupe, the final ingredient list is sorted alphabetically.

This provides:
- deterministic request payloads
- stable debugging output
- stable cacheability or payload comparison if introduced later

The recommendation engine therefore receives a canonical, deduped, alphabetically sorted ingredient list.

## 6. Inventory Merge Behavior

My Bar inventory is merged into recommendations through `InventoryProvider`.

Behavior:
- if inventory is already initialized, scan uses `availableIngredientKeys` from provider state
- if the user is signed in but inventory is not initialized yet, scan waits for `refreshInventory({ silent: true })`
- only inventory items with `remaining_pct > 0` contribute ingredient keys

This prevents uninitialized inventory state from being treated as empty inventory.

## 7. Final Request Payload

The final request is sent to:
- `POST /recommend-classics`

Payload shape:

```json
{
  "detected_ingredients": ["canonical_key_a", "canonical_key_b"],
  "locale": "en",
  "user_preference_vector": {},
  "user_interactions": {
    "favorite_codes": [],
    "liked_codes": [],
    "disliked_codes": []
  },
  "mood": "optional"
}
```

Field notes:
- `detected_ingredients`
  - canonical keys only
  - invalid inputs removed
  - deduped
  - alphabetically sorted
- `locale`
  - derived from app locale
- `user_preference_vector`
  - comes from explicit preferences or learned preferences fallback
- `user_interactions`
  - derived from favorites and like/dislike history
- `mood`
  - included only when selected

## Summary

The recommendation input pipeline in `scan.tsx` is:

1. scan image
2. detect ingredients
3. canonicalize every ingredient
4. filter invalid ingredients
5. merge My Bar inventory keys
6. dedupe canonical keys
7. sort alphabetically
8. send the final payload to `/recommend-classics`
