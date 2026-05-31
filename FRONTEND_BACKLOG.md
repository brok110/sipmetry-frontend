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
