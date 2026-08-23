# SCAN_ERRCARD_PLAN — 錯誤卡中性化 + 文案收攏(frontend 微案)

**Case**: SCAN-ERRCARD(founder 2026-07-17 定調,SCAN-ERRSTATE 批 B 後續 polish)
**Repo**: `brok110/sipmetry-frontend`(`sipmetry-20260128`),branch `main`
**File**: `app/scan.tsx`(唯一改動檔;兩處替換 E1 / E2)
**Baseline**: `48fea34`(SCAN-ERRSTATE 批 B 出貨版)。
**執行前先確認 repo 現況與本 plan OLD 區塊逐字一致。**

---

## 0. 執行鐵律(Claude Code 開場必讀)

- 只動 `app/scan.tsx`,只做 E1 / E2 兩處替換,嚴禁任何順手重構。
- **OLD block 不完全匹配(含空白、標點、註解)→ 立刻停下回報,不得自行調整。**
- R2 收尾邏輯(catch 內 mirror 批完分支)、resolver、guest 語意:一字不碰。
- 完成後跑 `npx tsc --noEmit`,貼出結果。不 commit、不 push、不跑其他指令。

## 1. 定案內容

- 錯誤卡改候選 B 中性配色:邊框 `OaklandDusk.bg.border`、底
  `OaklandDusk.bg.card`、標題 `OaklandDusk.text.primary`(內文維持
  `text.secondary`)。全錯誤共用,無分級。
- 標題 `Something went wrong` → `One moment`(對 429/5xx/斷網/413
  皆成立)。
- 429/5xx 文案收攏為 intent-neutral 單版——卡片只講「暫停」,
  「東西存在哪」交由緊接的批完 alert 陳述(N bottles added to
  My Bar / N items found),不再宣稱、不再說謊、`isGuestIntent`
  條件整組移除:
  - 429:`Scan limit reached — try again in a minute.`
  - 5xx:`A quick hiccup on our side — try again in a minute.`
- 413 與 generic 錯誤訊息不動。

---

## E1 — throw site 文案收攏(基準行號 L1412 一帶)

**OLD**(= 批 B R1 之 NEW,repo 現況)
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

**NEW**
```tsx
        if (!resp || !resp.ok) {
          const t = resp ? await resp.text() : "No response";
          // Error copy is intent-neutral: the card only says "pause"; the
          // batch-close alert that follows says where results live
          // (My Bar vs session list).
          if (resp?.status === 413) {
            throw new Error(
              "Ingredient API failed: 413 (payload too large). Please crop tighter or use a closer shot. (Tip: focus on the label area only.)"
            );
          }
          if (resp?.status === 429) {
            throw new Error(
              "Scan limit reached — try again in a minute."
            );
          }
          if ((resp?.status ?? 0) >= 500) {
            throw new Error(
              "A quick hiccup on our side — try again in a minute."
            );
          }
          throw new Error(`Ingredient API failed: ${resp?.status ?? "unknown"} ${t}`);
        }
```

## E2 — 錯誤卡樣式 + 標題(基準行號 L1948 一帶;批 B 前原檔為 L1935)

**OLD**
```tsx
      {error ? (
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, borderColor: OaklandDusk.accent.crimson, backgroundColor: OaklandDusk.accent.roseBg }}>
          <Text style={[Type.heading, { color: OaklandDusk.accent.crimson }]}>Something went wrong</Text>
          <Text style={{ color: OaklandDusk.text.secondary }}>{error}</Text>
        </View>
      ) : null}
```

**NEW**
```tsx
      {error ? (
        <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, borderColor: OaklandDusk.bg.border, backgroundColor: OaklandDusk.bg.card }}>
          <Text style={[Type.heading, { color: OaklandDusk.text.primary }]}>One moment</Text>
          <Text style={{ color: OaklandDusk.text.secondary }}>{error}</Text>
        </View>
      ) : null}
```

唯一性依據:`isGuestIntent` 為批 B R1 獨家引入、僅存於 E1 區塊;
`Something went wrong` 與 `{error ? (` 全檔各一次;`accent.crimson`
兩次皆在 E2 區塊內。E1 移除 `isGuestIntent` 後無殘留引用
(宣告與使用全在區塊內)。`bg.border` / `bg.card` / `text.primary`
均為檔內既用 token,零新增依賴。

---

## 2. 驗證

**編譯**:`npx tsc --noEmit` 必過(Claude Code 回報)。

**手測(Brok,一輪即可)**:沿用制度化受控 429 法——
本地 backend `OPENAI_USER_RATE_MAX=2` + frontend `.env` 指
`localhost:8787` + `npx expo start -c`。一般入口選 3 張:
- 錯誤卡:**無紅**(bg.border 框 / bg.card 底)、標題 `One moment`、
  內文 `Scan limit reached — try again in a minute.`
- 批完 alert 照常跳出(佐證 E1/E2 未波及 R2 收尾)、Done → footer。
- 5xx 無法自然複現:同一 catch 路 + code review 佐證。

## 3. 收尾

- **`.env` 還原(刪 localhost 行、首行去 `#`)必先於 OTA**——
  `eas update` 內嵌發佈當下 `.env`(鐵律)。
- 本地 backend Ctrl-C,`lsof -i:8787` 確認空。
- commit 點名 `app/scan.tsx`,單行 message(建議:
  `Neutralize scan error card: calm colors, unified 429/5xx copy`),
  Brok 手測批准後 push;`eas update --auto --platform ios`。
- 本檔更名 `SCAN_ERRCARD_PLAN_DONE.md` 歸檔;backend
  `ROUND_4_BACKLOG.md` § SCAN-ERRSTATE 批 B 結果段後追記一行
  (commit / OTA group 補實):
  `追記(2026-07-17,ERRCARD 微案):錯誤卡去紅改中性(bg.border/bg.card/text.primary)、標題 One moment;429/5xx 文案收攏 intent-neutral 單版(存放位置交由批完 alert 陳述),isGuestIntent 移除。frontend <commit>,OTA <group>。全紀錄:frontend repo「SCAN_ERRCARD_PLAN_DONE.md」。`

---

## 收案(2026-07-17)

- E1/E2 + E1b(429 文案 founder 微調:for the rest)由 Claude Code
  執行:OLD 唯一命中、逐字替換,tsc 乾淨。
- 手測:受控 429 一輪——卡片無紅、標題 One moment、新文案、
  alert/footer 收尾鏈未波及。
- 出貨:commit f53badc,EAS OTA group 47bda862(iOS)。
- 過程攔截:出貨前三關檢查(grep 文案/grep .env/lsof)抓到 .env
  仍指 localhost + 8787 殭屍,免去一次把 localhost 推上正式的
  OTA 事故——「還原先於 OTA」鐵律靠檢查落地,不靠記性。
