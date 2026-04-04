# Edit Bottle Modal Fix — Custom Size Input

## File: `app/(tabs)/inventory.tsx`

## Problem 1: Placeholder text renders as `50\u20135000` instead of `50–5000`

The `\u2013` escape sequence is not rendering correctly in the TextInput placeholder and helper text.

### Changes

**Line 406 — TextInput placeholder:**

BEFORE:
```
placeholder="Enter ml (50\u20135000)"
```

AFTER:
```
placeholder="e.g. 200"
```

**Lines 412-413 — Helper text below input:**

BEFORE:
```jsx
<Text style={{ fontSize: 11, color: '#888' }}>
  50\u20135000 ml
</Text>
```

AFTER:
```jsx
<Text style={{ fontSize: 11, color: '#888' }}>
  50 – 5000 ml
</Text>
```

Rationale: Placeholder should show an example value (immediately understandable). The valid range is communicated via the helper text below, using a literal en-dash character instead of `\u2013` escape.

---

## Problem 2: Keyboard covers the custom ml input field

The modal sheet sits at `justifyContent: 'flex-end'` with no `KeyboardAvoidingView`. When the number pad opens, the input is completely hidden.

### Changes

**Step 1 — Add `KeyboardAvoidingView` to imports (line 18):**

Find the import block containing `Modal`. Add `KeyboardAvoidingView` to it.

BEFORE:
```
  Modal,
```

AFTER:
```
  KeyboardAvoidingView,
  Modal,
```

**Step 2 — Wrap the sheet content inside the Modal (lines 347-458):**

BEFORE:
```jsx
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={modalStyles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* ...modal content... */}
        </Pressable>
      </Pressable>
    </Modal>
```

AFTER:
```jsx
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={modalStyles.overlay} onPress={onClose}>
          <Pressable style={modalStyles.sheet} onPress={(e) => e.stopPropagation()}>
            {/* ...modal content stays exactly the same... */}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
```

Note: `Platform` is already imported (line 18).

---

## DO NOT
- Change any other modal content (slider, save button, name input, etc.)
- Modify the `modalStyles` StyleSheet
- Touch anything outside the `EditBottleModal` function

## Verification
1. `npx tsc --noEmit` — no type errors
2. Open My Bar → tap a bottle card to edit → tap "Custom" size pill
3. Confirm placeholder shows `e.g. 200`
4. Confirm helper text below shows `50 – 5000 ml` (readable, no escape sequences)
5. Tap the custom ml input — keyboard should push the entire sheet up, input stays visible
6. Type a value — confirm it appears in the input field and is not hidden

## Git
```
git add . && git commit -m "fix: Edit Bottle custom size — fix placeholder rendering and keyboard occlusion"
```
