# SCAN_EDIT_ADD_PLAN_DONE.md

> **CASE CLOSED 2026-07-19** — 驗收 1/2/3/5/6 PASS、4 核心 PASS(誤建列刪除+無 dup;Bacardi 88% 判定為清場誤刪,SQL 證 upsert 不動 created_at)、7 依約跳過。
> frontend commit `00bb7af`(+62/−11,app/scan.tsx 單檔),已 push。
> 過程附帶:舊 bundle 假陰性一輪(expo start -c 解);手動站白名單不一致立案;F6 機制於 server.js upsert SQL 定罪(記 INV-MODEL 階段 2)。


**案號**: SCAN-EDIT-ADD(backlog 2026-07-19 立案)
**檔案**: `app/scan.tsx` 單檔,共 8 個 Block
**基準**: frontend main `4731492`(行號供參考;一切以 OLD 全文匹配為準)

**目標**: inventory 模式下 edit chip = 用戶宣告「這顆不是那瓶」。修正後:
(a) 更正後的瓶走 `maybeAddManualToInventory` 入庫(手動站語意:inline setError、不進 batch tally);
(b) 舊(誤讀)canonical 若為本 session auto-add 建立(`created=true`),其 inventory 列刪除;session 前既有列絕不觸碰。
順序先 add 後刪:add 失敗保留舊列,零淨損。quick_look 模式零影響。

**已拍板設計**(2026-07-19):
1. manual 站建立的列也進 session 追蹤(Block 5 內建)。
2. 更正成非酒精 → 舊錯列照刪(guard 跳過回 true 即支撐此語意)。
3. 刪除失敗 → inline setError,不靜默。
4. 單批執行,一個 commit。

## 執行鐵律
- **每個 OLD block 必須與實檔逐字完全匹配(含空白、空行);不完全匹配就停下回報,不得自行調整。**
- 依 Block 1 → 8 順序套用(全部互不重疊、各自唯一,順序僅為慣例)。
- 只改 plan 明列內容;案外邏輯一字不碰(含 `removeIngredient` 的 X 鈕——INV-MODEL 階段 2 地盤)。

## Block 1 — session-created 追蹤宣告(addTallyRef 之後,約 L593)
位置:addTallyRef 宣告區

### OLD
```tsx
  const addTallyRef = useRef({
    added: 0,
    already: 0,
    failed: 0,
    failedNames: [] as string[],
    nonAlcoholicNames: [] as string[],
  });
```

### NEW
```tsx
  const addTallyRef = useRef({
    added: 0,
    already: 0,
    failed: 0,
    failedNames: [] as string[],
    nonAlcoholicNames: [] as string[],
  });
  // SCAN-EDIT-ADD: snake-normalize exactly the way isInInventory and the
  // context's inventoryByIngredientKey do — write and read sides must
  // agree (C3 lesson).
  const snakeKey = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  // SCAN-EDIT-ADD: inventory rows created by THIS scan session (POST
  // returned created=true), keyed by snake-normalized canonical → row id.
  // Lets the edit station remove a mis-scan's auto-added row while never
  // touching rows that pre-date the session. Cleared in resetScan.
  const sessionCreatedRef = useRef<Map<string, string>>(new Map());
```

## Block 2 — useInventory 解構補 deleteInventoryItem(約 L616)
位置:component 頂部 hooks 區

### OLD
```tsx
  const { availableIngredientKeys, inventoryByIngredientKey, initialized: inventoryInitialized, refreshInventory, addInventoryItem } = useInventory();
```

### NEW
```tsx
  const { availableIngredientKeys, inventoryByIngredientKey, initialized: inventoryInitialized, refreshInventory, addInventoryItem, deleteInventoryItem } = useInventory();
```

## Block 3 — bulk resolver auto-add site 記 row 身分(約 L761)
位置:scanPhase "choice" resolver effect 內

### OLD
```tsx
            if (result.created) addTallyRef.current.added += 1;
            else addTallyRef.current.already += 1;
          } catch {
            addTallyRef.current.failed += 1;
            addTallyRef.current.failedNames.push(ing.display);
          }
        }
        await refreshInventory({ silent: true });
      }
      // Trigger "Scan More or Done" alert (after all inventory adds complete)
```

### NEW
```tsx
            if (result.created) {
              addTallyRef.current.added += 1;
              sessionCreatedRef.current.set(snakeKey(ing.canonical), result.id);
            } else {
              addTallyRef.current.already += 1;
            }
          } catch {
            addTallyRef.current.failed += 1;
            addTallyRef.current.failedNames.push(ing.display);
          }
        }
        await refreshInventory({ silent: true });
      }
      // Trigger "Scan More or Done" alert (after all inventory adds complete)
```

## Block 4 — per-photo auto-add site 記 row 身分(約 L1574)
位置:analyze() 內 inventory-mode 迴圈

### OLD
```tsx
            if (result.created) addTallyRef.current.added += 1;
            else addTallyRef.current.already += 1;
          } catch {
            addTallyRef.current.failed += 1;
            addTallyRef.current.failedNames.push(ing.display);
          }
        }
        await refreshInventory({ silent: true });
      }

      setError(null);
```

### NEW
```tsx
            if (result.created) {
              addTallyRef.current.added += 1;
              sessionCreatedRef.current.set(snakeKey(ing.canonical), result.id);
            } else {
              addTallyRef.current.already += 1;
            }
          } catch {
            addTallyRef.current.failed += 1;
            addTallyRef.current.failedNames.push(ing.display);
          }
        }
        await refreshInventory({ silent: true });
      }

      setError(null);
```

## Block 5 — maybeAddManualToInventory 回傳 boolean + 記 row 身分(約 L1652)
位置:函式整體重寫(含註解尾行 "// over.")

### OLD
```tsx
  // over.
  const maybeAddManualToInventory = async (canonical: string, display: string) => {
    if (scanMode !== "inventory" || !session) return;
    if (!canonical) return;
    if (isAlcoholicIngredient(canonical) === false) return;
    if (isInInventory(canonical)) return;
    try {
      await addInventoryItem({
        ingredient_key: canonical,
        display_name: display,
        total_ml: DEFAULT_BOTTLE_ML,
        remaining_pct: 100,
      });
    } catch {
      // Manual adds sit outside the photo-batch alert cycle — surface the
      // failure inline instead of polluting the batch tally.
      setError(`Couldn't save ${display} to My Bar — please try again.`);
    }
  };
```

### NEW
```tsx
  // over.
  // SCAN-EDIT-ADD: returns false only when the POST itself fails — guard
  // skips (wrong mode, non-alcoholic, already stocked) are legitimate
  // no-adds and return true, so the edit station can still remove a
  // mis-scan's session-created row after a guard-skipped correction.
  const maybeAddManualToInventory = async (canonical: string, display: string): Promise<boolean> => {
    if (scanMode !== "inventory" || !session) return true;
    if (!canonical) return true;
    if (isAlcoholicIngredient(canonical) === false) return true;
    if (isInInventory(canonical)) return true;
    try {
      const result = await addInventoryItem({
        ingredient_key: canonical,
        display_name: display,
        total_ml: DEFAULT_BOTTLE_ML,
        remaining_pct: 100,
      });
      if (result.created) {
        sessionCreatedRef.current.set(snakeKey(canonical), result.id);
      }
      return true;
    } catch {
      // Manual adds sit outside the photo-batch alert cycle — surface the
      // failure inline instead of polluting the batch tally.
      setError(`Couldn't save ${display} to My Bar — please try again.`);
      return false;
    }
  };
```

## Block 6 — resetScan 清空追蹤集(約 L1782)
位置:resetScan 開頭

### OLD
```tsx
  const resetScan = () => {
    setScanMode("undecided");
```

### NEW
```tsx
  const resetScan = () => {
    sessionCreatedRef.current.clear();
    setScanMode("undecided");
```

## Block 7 — saveEditIngredient 捕捉舊 canonical(約 L1850)
位置:saveEditIngredient 前段

### OLD
```tsx
    const existing = activeIngredients.find((x) => x.id === id);
    const before = String(existing?.display ?? "").trim();
```

### NEW
```tsx
    const existing = activeIngredients.find((x) => x.id === id);
    const before = String(existing?.display ?? "").trim();
    // SCAN-EDIT-ADD: the pre-edit canonical is the mis-scan's key — capture
    // it before the state update below wipes it, so the session-created row
    // it points at can be removed once the correction lands.
    const oldCanonical = String(existing?.canonical ?? "").trim();
```

## Block 8 — saveEditIngredient 雙向同步(約 L1878)
位置:saveEditIngredient resolve 尾段

### OLD
```tsx
    try {
      const canon = await resolveCanonicalForDisplay(v);
      if (!canon) return;
      setActiveIngredients((prev) => {
        const stillExists = prev.some((x) => x.id === id);
        if (!stillExists) return prev;
        return prev.map((x) => (x.id === id ? { ...x, canonical: canon } : x));
      });
    } catch {
      return;
    }
  };
```

### NEW
```tsx
    try {
      const canon = await resolveCanonicalForDisplay(v);
      if (!canon) return;
      setActiveIngredients((prev) => {
        const stillExists = prev.some((x) => x.id === id);
        if (!stillExists) return prev;
        return prev.map((x) => (x.id === id ? { ...x, canonical: canon } : x));
      });
      // SCAN-EDIT-ADD: an edit is the user declaring "that chip is not this
      // bottle" — sync My Bar both ways. Add the corrected bottle first
      // (manual-station semantics: inline setError, no batch tally); only
      // after the add path reports no failure remove the mis-scan's row,
      // and only if THIS session created it — rows that pre-date the
      // session are never touched. Add-then-delete order: a failed add
      // leaves the old row in place (no net loss).
      const added = await maybeAddManualToInventory(canon, v);
      const oldKey = snakeKey(oldCanonical);
      if (added && oldKey && oldKey !== snakeKey(canon)) {
        const staleRowId = sessionCreatedRef.current.get(oldKey);
        if (staleRowId) {
          try {
            await deleteInventoryItem(staleRowId);
            sessionCreatedRef.current.delete(oldKey);
          } catch {
            setError(`Couldn't remove ${before || "the previous bottle"} from My Bar — you can remove it in My Bar.`);
          }
        }
      }
    } catch {
      return;
    }
  };
```

## 完成後
1. TypeScript 無新錯誤(`npx tsc --noEmit` 或 editor 檢查)。
2. 回報 8/8 套用結果,等 Brok 手測。
3. 手測通過後 commit(Brok 執行):
   `git add app/scan.tsx && git commit -m "SCAN-EDIT-ADD: sync My Bar on chip edit - add corrected bottle, remove session-created mis-scan row"`
   push 等 Brok 明示。
4. 前端單檔案,無 server.js 改動 → 不需 run_regression.sh。

## 驗收清單(Brok 手測)
1. 主案:掃描誤讀 → chip edit 更正 → 正確瓶出現在 My Bar,誤建列即時消失(context 樂觀移除,免 refresh)。
2. 既有列保護:session 開始前就在庫的瓶,被 edit 換名後其列不動。
3. quick_look(guest intent)全程零 inventory 寫入/刪除。
4. edit 成已在庫的瓶:不 dup POST("In bar ✓" 徽章即亮),舊誤建列仍被刪。
5. edit 成非酒精(如改成 orange juice):新值不入庫,舊誤建列被刪。
6. manual 手打 → edit 更正:同樣雙向同步(追蹤含 manual 站)。
7. 刪除失敗路徑(可跳過或斷網模擬):inline error 出現,app 不 crash。
注意:demo 帳號 `aguardiente` 盲列是 INV-MODEL 驗收樣本,手測勿動勿清。
