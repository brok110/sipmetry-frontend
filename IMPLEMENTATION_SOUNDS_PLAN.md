# IMPLEMENTATION_SOUNDS_PLAN.md — Sound Effects

## Overview

Add sound effects to two key moments in Sipmetry to enhance user feedback and delight.

| Scene | Sound File | Trigger Location | Trigger Point |
|-------|-----------|-------------------|---------------|
| "I Made It" confirmed | `glass_clinking_2s-3s.mp3` | `app/recipe.tsx` → `handleMadeDrink` → Confirm `onPress` callback | After `setMadeDrinkState('done')` succeeds |
| Bottle scanning in progress | `martini_shake_pour_1s-10s.mp3` | `app/scan.tsx` → `analyze()` | Start at `setStage("identifying ingredients")`, stop when scan completes or errors |

## Prerequisites

- **Install expo-av**: `npx expo install expo-av`
- **Sound files** (already in place):
  - `assets/sounds/glass_clinking_2s-3s.mp3`
  - `assets/sounds/martini_shake_pour_1s-10s.mp3`

---

## Stage 1: SoundService module

**Goal**: Create `lib/sounds.ts` — a reusable sound service using `expo-av`.

**Success Criteria**:
- `SoundService.preload()` loads both sounds into memory
- `SoundService.play('cheers')` plays the glass clink
- `SoundService.playLoop('scanning')` plays scanning sound on loop
- `SoundService.stop('scanning')` stops the scanning loop
- `SoundService.setEnabled(false)` globally mutes all sounds
- Graceful no-op if sounds not yet loaded

**File**: `lib/sounds.ts`

**Status**: Not Started

---

## Stage 2: Integrate sounds into the two scenes

**Goal**: Wire `SoundService` calls into the correct trigger points.

**Success Criteria**:
- Tapping "Confirm" on "I Made It" plays glass clink
- Starting bottle scan plays shaker loop; finishing/erroring stops it

### 2A: "I Made It" — glass clink

**File**: `app/recipe.tsx`

**Import**: `import { SoundService } from '@/lib/sounds';`

**Where**: Inside `handleMadeDrink` → Confirm `onPress` callback, right after successful `recordInventoryUse`:

```typescript
// After this existing line:
setMadeDrinkState('done');
// Add:
SoundService.play('cheers');
```

### 2B: Scanning — shaker loop

**File**: `app/scan.tsx`

**Import**: `import { SoundService } from '@/lib/sounds';`

**Start loop** — right after `setStage("identifying ingredients")`:
```typescript
setStage("identifying ingredients");
SoundService.playLoop('scanning');  // add
```

**Stop loop** — in THREE places:

1. **Success path** — after `setError(null)` near end of try block:
```typescript
setError(null);
SoundService.stop('scanning');  // add
```

2. **Error path** — in catch block:
```typescript
setError(e?.message ?? "Failed to analyze image.");
setStage("idle");
SoundService.stop('scanning');  // add
```

3. **Component unmount cleanup**:
```typescript
useEffect(() => {
  return () => { SoundService.stop('scanning'); };
}, []);
```

**Status**: Not Started

---

## Stage 3: Preload on app start + user settings toggle

**Goal**: Preload sounds early; add on/off toggle in preferences.

**Success Criteria**:
- Sounds preloaded in `app/_layout.tsx` on app start
- User can toggle sounds on/off in Profile > Preferences
- Preference persists via AsyncStorage

### 3A: Preload in `app/_layout.tsx`

```typescript
import { SoundService } from '@/lib/sounds';

useEffect(() => {
  const init = async () => {
    const stored = await AsyncStorage.getItem('sipmetry:sounds_enabled');
    if (stored === 'false') SoundService.setEnabled(false);
    await SoundService.preload();
  };
  init();
  return () => { SoundService.unloadAll(); };
}, []);
```

### 3B: Toggle in `app/profile/preferences.tsx`

Add a "Sound Effects" switch that calls `SoundService.setEnabled()` and persists to AsyncStorage.

**Status**: Not Started

---

## File Summary

| Action | File |
|--------|------|
| CREATE | `lib/sounds.ts` |
| EDIT | `app/recipe.tsx` — add import + `SoundService.play('cheers')` |
| EDIT | `app/scan.tsx` — add import + playLoop/stop + cleanup useEffect |
| EDIT | `app/_layout.tsx` — preload + restore preference |
| EDIT | `app/profile/preferences.tsx` — sound toggle UI |
| INSTALL | `expo-av` via `npx expo install expo-av` |

## Execution Order

1. `npx expo install expo-av`
2. Stage 1: Create `lib/sounds.ts`
3. Stage 2: Wire up both trigger points
4. Stage 3: Preload + settings toggle
5. Test both scenes + toggle
6. Delete this file when complete
