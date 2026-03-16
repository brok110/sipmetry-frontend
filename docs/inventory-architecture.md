# Inventory Architecture

## Purpose

`InventoryProvider` exists to make inventory a shared client-side source of truth.

Before this provider, inventory reads and writes were spread across multiple screens:
- Scan
- Recipe
- My Bar tab
- Tab shell foreground refresh

That caused duplicate `GET /inventory` calls, inconsistent freshness, and repeated low-stock logic. The provider centralizes:
- inventory state
- inventory CRUD actions
- auth-aware initialization
- refresh behavior
- low-stock notification triggers

## Provider Location

`InventoryProvider` lives in [context/inventory.tsx](/Users/brok/Projects/sipmetry-20260128/context/inventory.tsx).

It is mounted in the root provider stack in [app/_layout.tsx](/Users/brok/Projects/sipmetry-20260128/app/_layout.tsx), inside `LowStockAlertProvider`, so inventory actions can trigger low-stock alerts.

## Provider State

The provider exposes:
- `inventory`
- `loading`
- `refreshing`
- `initialized`
- `error`
- `inventoryById`
- `inventoryByIngredientKey`
- `availableIngredientKeys`

It also exposes actions:
- `refreshInventory(options?)`
- `addInventoryItem(payload)`
- `updateInventoryItem(id, updates)`
- `deleteInventoryItem(id)`
- `recordInventoryUse(payload)`

## Endpoint Flow

### `GET /inventory`

Handled by `refreshInventory()`.

Used to:
- initialize inventory after auth activation
- refresh inventory on app foreground
- refresh inventory when My Bar tab gains focus
- satisfy pull-to-refresh
- recover inventory state after `POST /inventory/use`

`refreshInventory()` updates shared provider state and can optionally trigger low-stock scanning.

### `POST /inventory`

Handled by `addInventoryItem(payload)`.

Call flow:
1. POST to `/inventory`
2. normalize returned `item`
3. write item into shared provider state
4. call `checkAndNotify(...)` for low-stock handling

Used by:
- Scan screen `+ Bar`
- My Bar bottle-add flow

### `PATCH /inventory/:id`

Handled by `updateInventoryItem(id, updates)`.

Call flow:
1. PATCH `/inventory/:id`
2. normalize returned `item`
3. replace matching item in shared provider state
4. call `checkAndNotify(...)`

Used by:
- My Bar edit bottle flow

### `DELETE /inventory/:id`

Handled by `deleteInventoryItem(id)`.

Call flow:
1. DELETE `/inventory/:id`
2. remove item from shared provider state

Used by:
- My Bar delete action

### `POST /inventory/use`

Handled by `recordInventoryUse(payload)`.

Call flow:
1. POST `/inventory/use`
2. on success, call `refreshInventory({ silent: true, notifyLowStock: true })`

Used by:
- Recipe screen “I made this!” flow

## Consumer Flow

### Scan

[app/(tabs)/scan.tsx](/Users/brok/Projects/sipmetry-20260128/app/(tabs)/scan.tsx) consumes:
- `availableIngredientKeys`
- `initialized`
- `refreshInventory`
- `addInventoryItem`

Behavior:
- recommendation generation merges scanned ingredients with provider-backed inventory keys
- if inventory is not initialized yet for a signed-in user, scan waits for `refreshInventory({ silent: true })` before merging My Bar ingredients
- `+ Bar` adds bottles through `addInventoryItem(...)`

### Recipe

[app/recipe.tsx](/Users/brok/Projects/sipmetry-20260128/app/recipe.tsx) consumes:
- `inventory`
- `initialized`
- `refreshInventory`
- `recordInventoryUse`

Behavior:
- “I made this!” matches recipe ingredients against provider inventory
- if inventory is not initialized yet, recipe waits on `refreshInventory({ silent: true })`
- deduction uses `recordInventoryUse(...)`, which refreshes provider state afterward

### My Bar Tab

[app/(tabs)/inventory.tsx](/Users/brok/Projects/sipmetry-20260128/app/(tabs)/inventory.tsx) consumes:
- provider inventory state
- `refreshInventory`
- `addInventoryItem`
- `updateInventoryItem`
- `deleteInventoryItem`

Behavior:
- renders shared inventory directly
- refreshes inventory on tab focus with `refreshInventory({ silent: true })`
- pull-to-refresh uses `refreshInventory({ silent: true, notifyLowStock: true })`
- all add/edit/delete actions go through provider methods

## `refreshInventory()` Behavior

`refreshInventory(options?)` is the main synchronization entrypoint.

Options:
- `silent`
- `notifyLowStock`

Behavior:
1. validates auth and API config
2. fetches `GET /inventory`
3. normalizes response items
4. writes shared inventory state
5. optionally runs `scanAndNotifyAll(...)`

Important details:
- it throws on fetch failure, so callers can distinguish failure from a legitimate empty inventory result
- it uses an auth/version guard to prevent stale in-flight requests from writing state after logout or auth change
- auth activation runs `refreshInventory({ silent: true, notifyLowStock: true })` once per active token/api pair

## Low-Stock Notification Flow

Low-stock UI state is managed separately by `LowStockAlertProvider`, but inventory actions trigger it.

Trigger paths:
- auth-activation refresh with `notifyLowStock: true`
- app foreground refresh in [app/(tabs)/_layout.tsx](/Users/brok/Projects/sipmetry-20260128/app/(tabs)/_layout.tsx)
- My Bar pull-to-refresh with `notifyLowStock: true`
- `recordInventoryUse(...)` refresh with `notifyLowStock: true`
- `addInventoryItem(...)` via `checkAndNotify(...)`
- `updateInventoryItem(...)` via `checkAndNotify(...)`

Implementation split:
- `scanAndNotifyAll(...)` scans a full inventory list
- `checkAndNotify(...)` handles single-item mutation results
- `LowStockBanner` renders the visible banner

This keeps inventory state centralized while leaving low-stock presentation separate.
