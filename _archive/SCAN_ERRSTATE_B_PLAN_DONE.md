# SCAN_ERRSTATE_B_PLAN — 批次錯誤殘局收尾 + 5xx 體驗(frontend)

**Case**: ROUND_4_BACKLOG.md § SCAN-ERRSTATE 批 B
**Repo**: `brok110/sipmetry-frontend`(`sipmetry-20260128`),branch `main`
**File**: `app/scan.tsx`(唯一改動檔;三處替換 R1–R3)
**Baseline**: 2026-07-17 上傳之現行全檔(已含 ACCUMULATE Method A;
2359 行版)。**執行前先確認 repo 現況與本 plan OLD 區塊逐字一致。**

---

## 0. 執行鐵律(Claude Code 開場必讀)

- 只動 `app/scan.tsx`,只做 R1 / R2 / R3 三處替換,嚴禁任何順手重構。
- **OLD block 不完全匹配(含空白、標點、註解)→ 立刻停下回報,不得自行調整。**
- guest 語意(intent 解析、resolver guest 分支、quick_look 不入庫)、
  `multiScanResults` 寫入邏輯、photo queue 機制、app 層 limiter:
  **一字不碰**。R2 僅「讀」`multiScanResults.length`。
- 完成後跑 `npx tsc --noEmit`,貼出結果。不 commit、不 push
  (由 Brok 執行)。

---

## 1. 病理(定案,依現行檔行號)

1. catch(L1557–1565)只做 setError / setStage("idle") / 停音效 / 清 queue;
   `scanPhase` 只在整批跑完才設 "choice"(L1548)→ 中斷時 intent resolver
   (L715)永不觸發 → `scanMode` 卡 "undecided"。
2. undecided 下 per-photo 自動入庫(L1511)被 mode gate 擋 → 錯誤前已辨識
   的瓶子零入庫;但 429 文案(L1421)稱 "saved",不實。
3. 殘局 UI = 兩顆手動流按鈕(L2218–2277);Add(手打)退化為只加清單。
4. 5xx 落 L1424 generic throw,raw status + body 直呈用戶。

## 2. 設計決策(拍板點,三項)

**D1 — 收尾機制 = 複用批完分支,不寫第四份入庫 loop。**
catch 內鏡射 L1546–1555 的批完邏輯:有成果且 undecided → 設
`scanPhase("choice")` 交給既有 resolver(guest→quick_look 不入庫;
其餘→inventory + 自動入庫);mode 已定 → 設 "accumulating" + bump
`batchCompleteCount` 重發「Scan More or Done」alert 給用戶出口。
零成果 → 維持純錯誤顯示(無殘局可收)。
入庫 loop 全檔維持三份(resolver / per-photo / manual helper),不增生。

**D2 — 429/5xx 文案 intent-aware 雙版。**
非 guest:「已保留」升級為 "added to My Bar"(founder 定調)。
guest:必須維持不涉入庫的措辭("kept")——否則修一個謊(undecided
沒入庫卻說 saved)造另一個謊(guest 不入庫卻說已入庫)。判定源用
`searchParams.intent === "guest"`,與 resolver 同源。

**D3 — 兩顆手動流按鈕整組移除(R3)。**
依交接令「方向已定…整組移除」+ backlog L1236 產品聲明:純手動流
intentionally 不存在,唯一手動輸入 = 掃描後 review 期(inventory mode
下 Add 自動入庫已實測)。R1+R2 落地後 post-error 也不再產生
undecided 殘局,按鈕徹底無舞台。

## 3. Race 檢查(backlog 指定 audit 項)

1. 每張照片 = 獨立 analyze() 呼叫(autoAnalyze effect 於 re-render 後
   觸發)→ catch closure 讀到的 `multiScanResults` / `scanMode` 已含
   之前所有成功張的狀態,判斷正確。批次中 mode 不可能翻轉(resolver
   只在 "choice" 觸發;按鈕被 stage gate 擋且 R3 移除)。
2. R2 只在 `multiScanResults.length > 0` 才設 "choice" → resolver guard
   (L716)必然放行,不會卡死在 "choice"。
3. 錯誤路徑與正常批完路徑互斥(throw 後不會執行 L1546–1555)→
   "choice" 單次設定;alert 恰好一次:undecided 分支的 bump 由
   resolver 執行(L721/749),resolved 分支由 R2 執行,不重疊。
4. queue 先清(既有行為,R2 追加於其後)→ 收尾後不再彈照片重進
   analyze()。

---

## R1 — 429 文案升級 + 5xx 友善分支(throw site,L1412 一帶)

**OLD**
```tsx
        if (!resp || !resp.ok) {
          const t = resp ? await resp.text() : "No response";
          if (resp?.status === 413) {
            throw new Error(
              "Ingredient API failed: 413 (payload too large). Please crop tighter or use a closer shot. (Tip: focus on the label area only.)"
            );
          }
          if (resp?.status === 429) {
            throw new Error(
              "Scan limit reached. Bottles identified so far are saved — please wait a minute, then scan the remaining photos."
            );
          }
          throw new Error(`Ingredient API failed: ${resp?.status ?? "unknown"} ${t}`);
        }
```

**NEW**
```tsx
        if (!resp || !resp.ok) {
          const t = resp ? await resp.text() : "No response";
          // SCAN-ERRSTATE B: copy must match the error-path closure below —
          // non-guest resolves to inventory (bottles really do land in My Bar),
          // guest stays quick_look (session list only, never inventory).
          const isGuestIntent = searchParams.intent === "guest";
          if (resp?.status === 413) {
            throw new Error(
              "Ingredient API failed: 413 (payload too large). Please crop tighter or use a closer shot. (Tip: focus on the label area only.)"
            );
          }
          if (resp?.status === 429) {
            throw new Error(
              isGuestIntent
                ? "Scan limit reached. Items identified so far are kept — please wait a minute, then scan the remaining photos."
                : "Scan limit reached. Bottles identified so far are added to My Bar — please wait a minute, then scan the remaining photos."
            );
          }
          if ((resp?.status ?? 0) >= 500) {
            throw new Error(
              isGuestIntent
                ? "The scanner hit a hiccup on our side. Items identified so far are kept — please try the remaining photos again in a moment."
                : "The scanner hit a hiccup on our side. Bottles identified so far are added to My Bar — please try the remaining photos again in a moment."
            );
          }
          throw new Error(`Ingredient API failed: ${resp?.status ?? "unknown"} ${t}`);
        }
```

## R2 — catch 收尾:鏡射批完分支(L1557 一帶)

**OLD**
```tsx
    } catch (e: any) {
      setError(e?.message ?? "Failed to analyze image.");
      setStage("idle");
      SoundService.stop('scanning');
      // Clear queue on error so stale photos don't carry over
      imageQueueRef.current = [];
    } finally {
      setLoading(false);
    }
```

**NEW**
```tsx
    } catch (e: any) {
      setError(e?.message ?? "Failed to analyze image.");
      setStage("idle");
      SoundService.stop('scanning');
      // Clear queue on error so stale photos don't carry over
      imageQueueRef.current = [];
      // SCAN-ERRSTATE B: close the session on error the same way a drained
      // batch does (mirrors the batch-complete branch above). Photos that
      // succeeded before the error are already in multiScanResults —
      // undecided → "choice" hands off to the existing intent resolver
      // (guest → quick_look, else → inventory + auto-add); resolved modes
      // → re-fire "Scan More or Done" so the user has an exit. If nothing
      // succeeded there is no residue to close — plain error display.
      if (multiScanResults.length > 0) {
        if (scanMode === "undecided") {
          setScanPhase("choice");
        } else {
          setScanPhase("accumulating");
          setBatchCompleteCount((c) => c + 1);
        }
      }
    } finally {
      setLoading(false);
    }
```

## R3 — 兩顆手動流按鈕整組移除(L2218–2277)

**OLD**(整塊刪除,替換為空)
```tsx
          {/* Manual-input action buttons — manual-typed flow, or post-error (e.g. 429)
              in undecided mode. Hidden while a scan batch is in flight: `stage` is set
              to "identifying ingredients" at every analyze() start and only returns to
              "idle" via the error path or an entry handler — it does NOT reset on batch
              success, but by then the intent resolver has flipped scanMode, so the mode
              check hides the buttons anyway. */}
          {activeIngredients.length > 0 && scanMode === "undecided" && stage === "idle" && (
            <View style={{ gap: 10, marginTop: 12 }}>
              <Pressable
                onPress={async () => {
                  setScanMode("inventory");
                  if (session) {
                    for (const ing of activeIngredients) {
                      if (isAlcoholicIngredient(ing.canonical) === false) continue;
                      if (isInInventory(ing.canonical)) continue;
                      try {
                        await addInventoryItem({
                          ingredient_key: ing.canonical,
                          display_name: ing.display,
                          total_ml: DEFAULT_BOTTLE_ML,
                          remaining_pct: 100,
                        });
                      } catch {}
                    }
                    await refreshInventory({ silent: true });
                  }
                  setScanPhase("accumulating");
                  setBatchCompleteCount((c) => c + 1);
                }}
                style={{
                  backgroundColor: OaklandDusk.brand.gold,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.bg.void }}>
                  Add to My Bar
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setScanMode("quick_look");
                  setShowStaplesModal(true);
                }}
                style={{
                  borderWidth: 1,
                  borderColor: OaklandDusk.brand.gold,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: OaklandDusk.brand.gold }}>
                  Show Recipes
                </Text>
              </Pressable>
            </View>
          )}
```

**NEW**:(空——整塊刪除)

R3 後續無 unused 殘留:`addInventoryItem` / `refreshInventory` /
`isInInventory` / `isAlcoholicIngredient` / `DEFAULT_BOTTLE_ML` /
`setScanMode` / `setScanPhase` / `setBatchCompleteCount` /
`setShowStaplesModal` 均另有使用點。

---

## 4. 驗證

**編譯**:`npx tsc --noEmit` 必過(Claude Code 回報)。
frontend-only 案,不需 run_regression.sh。

**手測(Brok,simulator/device)**:
- b1 非 guest 首批 11 張(壓爆 app 層 10/分 limiter → 穩定復現 429):
  第 11 張中斷 → 新版 429 文案("added to My Bar");錯誤前成功瓶
  已在 My Bar;「N bottles added to My Bar」alert 出現;Done →
  review + sticky footer("Based on my bar");往下捲**無**兩顆按鈕。
- b2 guest 入口(intent=guest)同法觸發:guest 版文案("kept");
  My Bar 零寫入;「N items found」alert;footer "Based on N
  ingredients"。
- b3 第二批(mode 已 inventory)中段錯:alert 重發、有 Scan More /
  Done 出口,phase 不卡 "accumulating"。
- b4 首張即錯(單張直接 429 或斷網):純錯誤顯示,無 alert,
  無殘局按鈕。
- 5xx 無法自然複現(批 A 已把上游 429 翻正):以 b1 等價路徑
  (同一 catch)+ code review 佐證;後續自然發生時以
  「友善文案 + 正常收尾」為驗收。

## 5. 收尾

- commit 點名 `app/scan.tsx`,單行 message,無 Co-Authored-By。
- Brok 手測批准後才 push;JS-only → `eas update --auto --platform ios`。
- 完工:本檔更名 `SCAN_ERRSTATE_B_PLAN_DONE.md` 歸檔;
  ROUND_4_BACKLOG.md § SCAN-ERRSTATE 批 B 標 resolved。

---

## 收案(2026-07-17)

- R1–R3 由 Claude Code 執行:三處 OLD 唯一命中、逐字替換,tsc 乾淨。
- 驗收:本地 backend `OPENAI_USER_RATE_MAX=2` 受控 429。
  b1 首批中斷(新文案/resolver 收尾/inventory POST 實證/footer/無按鈕)✓
  b4 零成果不收尾 ✓;b3 mode 已定重發 alert 有出口 ✓
  b2 guest(kept 文案/零 inventory POST/Based on N ingredients)✓
- 出貨:commit 48fea34,EAS OTA group 0b30aa40(iOS)。
- Alert 計數失真(「All set」偏小/前輪偏大)= INV-MODEL 同根既知,不在本案。
