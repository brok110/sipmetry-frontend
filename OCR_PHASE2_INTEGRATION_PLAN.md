# OCR Phase 2 — Hybrid OCR + Text-Only LLM Integration

**目標：** 在 scan flow 中加入 on-device OCR 預處理，用文字取代圖片送給 LLM，降低 API 成本 ~20 倍（$4-5/月 → ~$0.20/月），同時保留 vision fallback。

**前提：**
- Phase 1 POC 通過：on-device OCR 308-546ms，品牌辨識率高（Kikori、Kavalan、Barsol 全部正確）
- `expo-text-extractor` 已安裝在前端
- 現有 `/analyze-image` 使用 GPT-4o-mini vision，response schema: `{ detected_items[], ingredients[], ingredients_raw[], ingredients_display[], safety }`
- scan.tsx 的 downstream 處理（normalize → inventory → recommendations）不需要改

**架構：**
```
[現在] 拍照 → resize+compress → base64(~500KB) → /analyze-image → GPT-4o-mini VISION → $0.004/scan
[Phase 2] 拍照 → on-device OCR(~300ms) → text blocks → /analyze-text → GPT-4o-mini TEXT → $0.0002/scan
                                         ↓ (OCR text < 20 chars)
                                         fallback → /analyze-image (現有 flow，不變)
```

---

## Stage 1: Backend — 新增 `/analyze-text` endpoint

**Goal:** 建一個接收 OCR 文字（不是圖片）的 endpoint，用 text-only GPT-4o-mini 分類，回傳與 `/analyze-image` 完全一致的 response schema。

**File:** `server.js`

**Locator:**
```bash
grep -n 'POST.*analyze-image\|POST.*identify-bottle' server.js
```

**Actions:**

1. 在 `/analyze-image` endpoint **之前**（在 `ANALYZE_BODY_LIMIT` 定義之後），插入 `/analyze-text` endpoint：

```javascript
// ── POST /analyze-text ──────────────────────────────────────────────────────
// Accepts OCR-extracted text blocks from on-device OCR (ML Kit / Apple Vision).
// Uses text-only GPT-4o-mini (no image tokens) → ~20x cheaper than vision.
// Response schema is IDENTICAL to /analyze-image for frontend compatibility.
app.post("/analyze-text", requireAuth, openaiLimiter, openaiUserLimiter, express.json({ limit: "100kb" }), async (req, res) => {
  const TOTAL_LABEL = "[analyze-text] total";
  const OPENAI_LABEL = "[analyze-text] openai";

  let ended = false;
  const endTimer = () => {
    if (!ended) { console.timeEnd(TOTAL_LABEL); ended = true; }
  };

  console.log("[analyze-text] start", new Date().toISOString());
  console.time(TOTAL_LABEL);

  try {
    const { ocr_text, return_raw, return_detected_items, return_display } = req.body;

    if (!ocr_text || typeof ocr_text !== "string" || ocr_text.trim().length < 3) {
      endTimer();
      return res.status(400).json({ error: "missing or empty ocr_text" });
    }

    if (!process.env.OPENAI_API_KEY || !client) {
      endTimer();
      return res.status(500).json({ error: "missing OPENAI_API_KEY in .env" });
    }

    const trimmedText = ocr_text.trim().slice(0, 5000); // Cap at 5000 chars (~1500 tokens)

    const prompt =
      "You are a label/ingredient recognizer for a cocktail app.\n" +
      "The following text was extracted via OCR from a photo of one or more bottles.\n" +
      "The OCR text may contain noise, partial words, or text from multiple bottles.\n\n" +
      "Return ONLY valid JSON.\n" +
      "For EACH distinct bottle/spirit detected in the text, create an entry in 'detected_items'.\n" +
      "Each entry MUST have:\n" +
      "  raw: the brand/product name exactly as it appeared in the OCR text\n" +
      "  display: a cleaned-up, human-readable version (e.g., 'Maker's Mark Bourbon')\n" +
      "  canonical: a normalized snake_case ingredient_key for matching. Most specific match from:\n" +
      "    gin, london_dry_gin, vodka, rum, white_rum, dark_rum, spiced_rum,\n" +
      "    tequila, tequila_blanco, tequila_reposado, tequila_anejo, mezcal,\n" +
      "    bourbon, whiskey, scotch_whisky, irish_whiskey, rye_whiskey, japanese_whisky,\n" +
      "    brandy, cognac, pisco, cachaca, absinthe,\n" +
      "    campari, aperol, triple_sec, cointreau, grand_marnier, orange_curacao,\n" +
      "    sweet_vermouth, dry_vermouth, bianco_vermouth,\n" +
      "    bitters, angostura_bitters, orange_bitters, peychauds_bitters,\n" +
      "    kahlua, coffee_liqueur, elderflower_liqueur, amaretto, chartreuse,\n" +
      "    benedictine, maraschino_liqueur, drambuie, chambord, creme_de_cassis,\n" +
      "    creme_de_cacao, galliano, fernet_branca, amaro, cream_liqueur,\n" +
      "    or another appropriate snake_case key.\n" +
      "  confidence: 'high' if brand name clearly present, 'medium' if partial, 'low' if guessing\n\n" +
      "Also return top-level arrays:\n" +
      "  ingredients: array of canonical keys (deduped)\n" +
      "  ingredients_raw: array of raw strings (deduped)\n" +
      "  ingredients_display: array of display strings (deduped)\n" +
      "  safety: { non_consumable_items: [], risk_level: 'none', message: '' }\n\n" +
      "Output schema:\n" +
      '{\n' +
      '  "detected_items": [{ "raw": "...", "display": "...", "canonical": "...", "confidence": "..." }],\n' +
      '  "ingredients": ["..."],\n' +
      '  "ingredients_raw": ["..."],\n' +
      '  "ingredients_display": ["..."],\n' +
      '  "safety": { "non_consumable_items": [], "risk_level": "none", "message": "" }\n' +
      '}\n\n' +
      "If no bottles/spirits can be identified from the text, return empty arrays.\n" +
      "Do NOT guess — if the text is too noisy or unrelated to alcohol, return empty arrays.\n\n" +
      "OCR text:\n" + trimmedText;

    const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS_ANALYZE || 30_000);
    console.log("[analyze-text] calling OpenAI text-only... (timeout:", timeoutMs, "ms)");
    console.log("[analyze-text] ocr_text length:", trimmedText.length, "chars");

    let response;
    console.time(OPENAI_LABEL);
    try {
      response = await openaiCreateWithTimeout(
        client.responses.create({
          model: "gpt-4o-mini",
          temperature: 0,
          max_output_tokens: 1024,
          text: {
            format: {
              type: "json_schema",
              name: "ocr_ingredient_analysis",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  detected_items: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        raw: { type: "string" },
                        display: { type: "string" },
                        canonical: { type: "string" },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                      },
                      required: ["raw", "display", "canonical", "confidence"],
                    },
                  },
                  ingredients: { type: "array", items: { type: "string" } },
                  ingredients_raw: { type: "array", items: { type: "string" } },
                  ingredients_display: { type: "array", items: { type: "string" } },
                  safety: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      non_consumable_items: { type: "array", items: { type: "string" } },
                      risk_level: { type: "string", enum: ["none", "possible", "high"] },
                      message: { type: "string" },
                    },
                    required: ["non_consumable_items", "risk_level", "message"],
                  },
                },
                required: ["detected_items", "ingredients", "ingredients_raw", "ingredients_display", "safety"],
              },
            },
          },
          input: [
            { role: "user", content: prompt },
          ],
        }),
        timeoutMs
      );
    } finally {
      console.timeEnd(OPENAI_LABEL);
    }

    const text = response?.output_text || "";
    console.log("[analyze-text] got OpenAI response, length:", text.length);

    const cleaned = String(text).trim();
    let detected_items = [];
    let safety = { non_consumable_items: [], risk_level: "none", message: "" };
    let ingredients = [];
    let ingredients_raw = [];
    let ingredients_display = [];
    const cleanStr = (s) => String(s || "").trim();

    try {
      const obj = JSON.parse(cleaned);

      const s = obj && typeof obj.safety === "object" ? obj.safety : {};
      const nonRaw = Array.isArray(s.non_consumable_items) ? s.non_consumable_items : [];
      const nonConsumable = [...new Set(nonRaw.map(cleanStr).filter(Boolean))];
      const risk = typeof s.risk_level === "string" ? s.risk_level : "none";
      const msg = typeof s.message === "string" && s.message.trim() ? s.message.trim() : "";
      const defaultMsg = nonConsumable.length > 0
        ? "Possible non-consumable item(s) detected. Do NOT ingest. Please double-check."
        : "";
      const safeRisk = risk === "high" || risk === "possible" || risk === "none" ? risk : "possible";

      safety = {
        non_consumable_items: nonConsumable,
        risk_level: nonConsumable.length > 0 ? (safeRisk === "none" ? "possible" : safeRisk) : "none",
        message: msg || defaultMsg,
      };

      const modelDetected = Array.isArray(obj.detected_items) ? obj.detected_items : [];
      detected_items = modelDetected
        .filter((d) => d && typeof d === "object")
        .map((d) => ({
          raw: cleanStr(d.raw),
          display: cleanStr(d.display),
          canonical: cleanStr(d.canonical),
          confidence: d.confidence || "medium",
        }))
        .filter((d) => d.raw || d.display || d.canonical);

      // Apply smartCanonicalize (same as /analyze-image)
      const aliasMap = await loadAliasMap();
      detected_items = detected_items.map((it) => {
        const src = it.display || it.raw;
        const out = smartCanonicalize(src, aliasMap);
        const outCanon = String(out?.canonical || "").trim();
        const outMatch = String(out?.match || "raw").trim();
        const curCanon = String(it?.canonical || "").trim();
        if (outCanon && outMatch !== "raw" && outCanon.toLowerCase() !== curCanon.toLowerCase()) {
          return { ...it, canonical: outCanon, match: "heuristic" };
        }
        return it;
      });

      ingredients = Array.isArray(obj.ingredients) ? obj.ingredients.map(cleanStr).filter(Boolean) : [];
      ingredients_raw = Array.isArray(obj.ingredients_raw) ? obj.ingredients_raw.map(cleanStr).filter(Boolean) : [];
      ingredients_display = Array.isArray(obj.ingredients_display) ? obj.ingredients_display.map(cleanStr).filter(Boolean) : [];
    } catch (parseErr) {
      console.error("[analyze-text] JSON parse error:", parseErr.message);
    }

    // Override top-level arrays from detected_items (canonical source of truth)
    if (detected_items.length > 0) {
      ingredients = [...new Set(detected_items.map((d) => d.canonical).filter(Boolean))];
      ingredients_raw = [...new Set(detected_items.map((d) => d.raw).filter(Boolean))];
      ingredients_display = [...new Set(detected_items.map((d) => d.display).filter(Boolean))];
    }

    const result = {
      detected_items,
      ingredients,
      ingredients_raw,
      ingredients_display,
      safety,
      source: "ocr_text", // Lets frontend know this came from OCR path
    };

    endTimer();
    return res.json(result);
  } catch (err) {
    endTimer();
    console.error("[analyze-text] error:", err?.message || err);

    if (err?.name === "openai_timeout") {
      return res.status(504).json({ error: "openai_timeout" });
    }
    return res.status(500).json({ error: "server_error" });
  }
});
```

2. 需要繞過 global body parser 限制（跟 `/analyze-image` 一樣）。找到：
```bash
grep -n 'analyze-image.*identify-bottle.*return next' server.js
```
這行應該類似：
```javascript
if (url.startsWith("/analyze-image") || url.startsWith("/identify-bottle")) return next();
```
改為：
```javascript
if (url.startsWith("/analyze-image") || url.startsWith("/identify-bottle") || url.startsWith("/analyze-text")) return next();
```

3. 確認 `loadAliasMap` 和 `smartCanonicalize` 函數在 scope 內：
```bash
grep -n 'function loadAliasMap\|function smartCanonicalize\|const loadAliasMap\|const smartCanonicalize' server.js
```

**DO NOT:**
- 不要修改 `/analyze-image` endpoint — 它保留為 vision fallback
- 不要修改 `/identify-bottle` endpoint
- 不要在 `/analyze-text` 使用 `input_image` — 這是 text-only
- 不要改 `openaiLimiter` 或 `openaiUserLimiter` 的設定

**Tests:**
- `node --check server.js`
- `grep -n 'analyze-text' server.js` — 預期 ≥ 5 處（endpoint 定義 + log labels）
- `./run_regression.sh` — 確認沒有 regression（新 endpoint 不影響現有 test）

**Status:** Not Started

---

## Stage 2: Frontend — scan.tsx 加 OCR 預處理 + fallback

**Goal:** 在 analyze() 函數中，拍照後先跑 on-device OCR。如果 OCR text 足夠（≥ 20 chars），走 `/analyze-text`；否則 fallback 走 `/analyze-image`。

**File:** `app/scan.tsx`

**Locator:**
```bash
grep -n 'extractTextFromImage\|analyze-image\|SIZE_CASCADE\|async.*analyze' app/scan.tsx
```

**Actions:**

### 2a. 在 scan.tsx 頂部加 import

找到其他 import 區塊，加入：

```typescript
import { extractTextFromImage, isSupported as ocrIsSupported } from 'expo-text-extractor';
```

位置：在 `import * as ImagePicker` 或類似 import 附近。

### 2b. 在 analyze() 函數內，SIZE_CASCADE loop 之前，加 OCR 嘗試

找到 `analyze()` 函數。搜尋：
```bash
grep -n 'SIZE_CASCADE\|const analyze' app/scan.tsx
```

在 SIZE_CASCADE 定義之前，先確認 `data` 變數的宣告方式。搜尋：
```bash
grep -n 'let data\|const data\|var data' app/scan.tsx | head -10
```

然後在 `SIZE_CASCADE` 之前，插入 OCR 嘗試邏輯。具體結構：

```typescript
    // ── OCR-first path: on-device text extraction → /analyze-text ──
    let ocrUsed = false;
    let data: any = null; // ← 如果 data 已在更上層宣告，就不用重複宣告

    if (ocrIsSupported && imageUri) {
      try {
        console.log("[scan] attempting on-device OCR...");
        const ocrStart = Date.now();
        const ocrBlocks = await extractTextFromImage(imageUri);
        const ocrText = ocrBlocks.join("\n").trim();
        const ocrMs = Date.now() - ocrStart;
        console.log(`[scan] OCR completed in ${ocrMs}ms, ${ocrBlocks.length} blocks, ${ocrText.length} chars`);

        if (ocrText.length >= 20) {
          console.log("[scan] OCR text sufficient, using /analyze-text");

          const textResp = await apiFetch("/analyze-text", {
            session,
            method: "POST",
            body: {
              ocr_text: ocrText,
              return_raw: true,
              return_detected_items: true,
              return_display: true,
            },
          });

          setLastHttpStatus(textResp.status);

          if (textResp.ok) {
            const textData = await textResp.json();

            if (textData.detected_items && textData.detected_items.length > 0) {
              ocrUsed = true;
              data = textData;
              console.log(`[scan] OCR path success: ${textData.detected_items.length} items detected`);
            } else {
              console.log("[scan] OCR path returned empty results, falling back to vision");
            }
          } else {
            console.log(`[scan] /analyze-text returned ${textResp.status}, falling back to vision`);
          }
        } else {
          console.log(`[scan] OCR text too short (${ocrText.length} chars), falling back to vision`);
        }
      } catch (ocrErr: any) {
        console.warn("[scan] OCR failed, falling back to vision:", ocrErr?.message);
      }
    }

    // ── Vision fallback: original /analyze-image path ──
    if (!ocrUsed) {
      // ... 現有的 SIZE_CASCADE loop + /analyze-image 呼叫 + response parsing ...
      // ... data = parsed result ...
    } // end if (!ocrUsed)

    // ── 從這裡開始，downstream processing 用 data（不管來自 OCR 或 vision）──
```

**關鍵：** 需要把現有的 SIZE_CASCADE loop 和 response parsing 整段用 `if (!ocrUsed) { ... }` 包起來。`data` 變數必須在這個 if 之前宣告，或者把現有的 `data` 宣告提升上去。

如果現有的 `data` 變數是用 `const` 宣告在 SIZE_CASCADE 之後，需要改成 `let` 並提升到 OCR 嘗試之前。

### 2c. 不要改 downstream result processing

OCR path 和 vision path 都把結果放到同一個 `data` 變數 → 後面的 `normalizeIngredientKey`、`multiScanResults` 累積、inventory auto-add 等邏輯完全不動。

**DO NOT:**
- 不要改 `preprocessImageForAnalyze` 函數
- 不要改 SIZE_CASCADE 的值
- 不要改 result processing（normalize → inventory → recommendations）
- 不要改 `pickImage()` 或 `takePhoto()` 函數
- 不要移除 vision fallback — OCR 失敗時必須有 fallback
- 不要在 OCR 失敗時 throw error — 要 catch + fallback
- 不要改 `apiFetch` 函數
- 不要加新的 state 變數（`ocrUsed` 是 local variable，不是 state）

**Tests:**
- `npx tsc --noEmit`
- 確認 import 存在：`grep 'extractTextFromImage' app/scan.tsx`
- 確認 fallback 存在：`grep 'ocrUsed' app/scan.tsx` — 預期 ≥ 3 處

**Status:** Not Started

---

## Stage 3: Backend regression test

**Goal:** 確認新 endpoint 沒有破壞現有功能 + 新 endpoint 基本 schema 正確。

**Actions:**

1. 跑 regression：
```bash
./run_regression.sh
```
全部現有 test 必須通過。

2. 手動 curl 測試（需要 valid token）：
```bash
curl -s -X POST "$BASE_URL/analyze-text" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"ocr_text": "MAKERS MARK KENTUCKY STRAIGHT BOURBON WHISKY 45% ALC./VOL. 750ML"}' | jq .
```

預期回傳包含：
- `detected_items[0].canonical` 類似 `"bourbon"`
- `detected_items[0].display` 類似 `"Maker's Mark Bourbon"`
- `source: "ocr_text"`

**DO NOT:**
- 不要修改或刪除任何現有 test

**Status:** Not Started

---

## Stage 4: 驗收 + 手動測試

**Goal:** 在手機上測試完整 OCR → LLM pipeline。

**Actions:**

1. Deploy backend 到 Render（`git push`）
2. 用 EAS dev build 在手機測試以下場景：

| 場景 | 預期行為 |
|---|---|
| 清晰酒瓶標籤 | OCR path → `/analyze-text` → 正確辨識 → 加入 inventory |
| 模糊/反光標籤 | OCR text < 20 chars → fallback `/analyze-image` → vision 辨識 |
| 多瓶同框 | OCR 抓到多個品牌 → 全部正確分類 |
| 非酒精物品 | OCR 可能抓到文字 → LLM 回傳 empty arrays → 無操作 |

3. 確認 console log 顯示正確 path：
   - `[scan] OCR completed in XXXms, N blocks, M chars`
   - `[scan] OCR path success: N items detected`（成功）
   - 或 fallback log（正確 fallback）

**Status:** Not Started

---

## Stage 5: 清理

**Goal:** 移除計畫文件。

**Actions:**
```bash
rm OCR_PHASE1_POC_PLAN.md
rm OCR_PHASE2_INTEGRATION_PLAN.md
```

**Status:** Not Started

---

## 備註

### Response schema 一致性
`/analyze-text` 的 response 與 `/analyze-image` 完全一致，加一個額外欄位：
```json
{
  "detected_items": [{ "raw": "...", "display": "...", "canonical": "...", "confidence": "..." }],
  "ingredients": ["bourbon"],
  "ingredients_raw": ["MAKERS MARK"],
  "ingredients_display": ["Maker's Mark Bourbon"],
  "safety": { "non_consumable_items": [], "risk_level": "none", "message": "" },
  "source": "ocr_text"
}
```

### Fallback 條件
| 條件 | 行為 |
|---|---|
| `ocrIsSupported === false`（如 web / Expo Go） | 直接走 vision |
| OCR text < 20 chars | 走 vision |
| `/analyze-text` 回 non-200 | 走 vision |
| `/analyze-text` 回 200 但 `detected_items` 為空 | 走 vision |
| OCR throw error | catch → 走 vision |

### 成本比較
| Path | Input tokens | Cost per scan |
|---|---|---|
| `/analyze-image`（vision） | ~25,000 | ~$0.004 |
| `/analyze-text`（text-only） | ~500-1000 | ~$0.0002 |

### `/identify-bottle` 不動
`/identify-bottle` 是 inventory 頁面的單瓶掃描，與 scan.tsx 的多瓶 flow 分開。Phase 3 再決定是否也加 OCR。

## Git Commit Messages

**Stage 1 完成後（backend）：**
```
feat(api): add /analyze-text endpoint for OCR-based bottle recognition

- Text-only GPT-4o-mini analysis (~20x cheaper than vision path)
- Same response schema as /analyze-image for frontend compatibility
- Includes smartCanonicalize post-processing
- Rate limited with openaiLimiter + openaiUserLimiter
```

**Stage 2 完成後（frontend）：**
```
feat(scan): add on-device OCR preprocessing with vision fallback

- Extract text via expo-text-extractor before sending to API
- If OCR text >= 20 chars, use /analyze-text (text-only LLM)
- Falls back to /analyze-image (vision) if OCR insufficient
- No changes to downstream result processing
```
