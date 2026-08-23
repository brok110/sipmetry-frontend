# Sipmetry 上架進度 Handoff（2026-06-07）

> 給新 chat 的交接文件。Sipmetry 首次 App Store 送審準備。
> 溝通慣例：討論用繁體中文，code / 文案 / 值用英文。
> 分工：Brok 負責 git / Supabase / simulator / App Store Connect（ASC）實際操作；Claude 負責 plan / audit / draft / review。

---

## 一、背景（一句話版）

Sipmetry 是 iOS 調酒推薦 app（iPhone-only、US App Store、English、Food & Drink 類別），核心價值：用相機讀酒櫃 → 推薦你「現在就能調」的雞尾酒 + 「下一瓶買什麼最划算」。目前在**首次送審準備的收尾階段**，幾乎所有 metadata 都已定稿，**主要剩 Screenshots 沒做**。

- ascAppId：**6760887396**
- Bundle：`com.sipmetry.app`
- Demo / 審核帳號：**sipmetry.review@gmail.com / Review2026!**（reviewer 要用，務必保持可登入）
- user_id：`b187a1af-2376-4e8e-913b-f6f3ebf1b361`

---

## 二、這次 session 完成了什麼 ✅

### 1. Support URL + 官網（DONE，已上線驗證）
- **問題根因**：`sipmetry.app` 原本顯示「Email Confirmed」落地頁，不能當 Support URL（Apple 要求 support/contact 資訊）。
- **修法（已執行、已驗證）**：
  - 在 `brok110/sipmetry-site` 新增 `confirmed.html` 承接原本的 email-confirmed 內容（含 `sipmetry://` 自動開 app script）。
  - Supabase **Site URL 改成 `https://sipmetry.app/confirmed.html`**（redirect allowlist 不變）。
  - 根目錄 `index.html` 換成**首頁/support 頁**（OaklandDusk 深色、"Your private bartender"、SUPPORT 區含 `brok110@gmail.com`、LEGAL 區含 Privacy Policy 連結、© 2026）。
  - **不要刪 CNAME**（= sipmetry.app）。
- ASC Support URL + Marketing URL 都用 `https://sipmetry.app`。**兩個 URL 都已驗證正常載入**，Privacy Policy 連結正常。

### 2. email deep-link 驗證（DONE）
- 用 `brok110@gmail.com` 重跑註冊：驗證信點完**落到 `/confirmed.html` 且成功開回 app（`sipmetry://`）**。清掉 backlog 那條待辦。

### 3. Delete Account 功能驗證（DONE，bonus）
- 用 app 內 Profile → Delete Account 刪 `brok110@gmail.com`，**成功**。證明 `DELETE /account` 清理邏輯正確（先清子表再刪 auth），與隱私政策承諾一致。reviewer 必測項目，已確認可用。

### 4. App Privacy 問卷（DONE，本次剛改完並 Publish）
ASC 的 App Privacy（2 個月前 published）本次核對 + 修正，**對齊隱私政策附錄**。本次兩處改動：
- **① birth_year（顯示為 "Other Data Types"）用途修正**：拿掉 **Product Personalization**、加上 **Analytics**、保留 **App Functionality**。→ 最終 = **App Functionality + Analytics**（Linked Yes、Tracking No）。理由：政策 §1 明寫 birth_year 用於 "age verification and aggregate analytics"。
- **② 新增 Usage Data → Product Interaction**（讚/倒讚/評分）：用途 **App Functionality + Product Personalization**、Linked **Yes**、Tracking **No**。理由：原本標籤漏掉這整個類別，但 app 確實存互動紀錄（`/interactions`）、政策附錄也列了。
- **驗證過不用加 Name**：跑 SQL 確認 `auth.users` 所有 provider（email / apple）的 `full_name`/`name`/`avatar_url` 全為 null；public schema 也沒有任何人名欄位（只有材料/酒譜/品項名）。Sign in with Apple 沒帶名字進來。Contact Info 維持只有 Email 是正確的。
- **Tracking 全程 No**（無廣告、無 data broker、無跨 app 追蹤）。

### 5. Age Rating（DONE，先前 session）
- Calculated Rating = **18+**（Apple 新制：Alcohol/Tobacco/Drug = Frequent 驅動）。Age Assurance = No（生日自填 ≠ Apple API/政府 ID）。

### 6. 版本文案 4d（DONE，已定稿）
> ⚠️ 新 chat 請向 Brok 確認這些**是否都已實際輸入並儲存到 ASC**（先前是「定稿」，未必都已填入）。

- **Promotional Text**（~169/170，唯一可隨時改的欄位）：
  `Sipmetry tells you what you can make right now from the bottles you own — and the one bottle that adds the most new cocktails. Recommendations that fit your taste.`
- **App Name / Title**（28/30）：`Sipmetry: Cocktail Bartender`
- **Subtitle**（28/30）：`Mixology, Home Bar & Recipes`
- **Keywords**（96/100）：`whiskey,bourbon,gin,rum,tequila,vodka,drinks,bottle,restock,scanner,ai,classic,margarita,martini`
- **Description**（2071/4000）：暖男開場「Everyone should have a bartender who just gets you」，已驗證 130+ recipes、Safety Mode 4 flags、移除所有 night/tonight、無 "decision engine" 用語。canonical 內容存於先前 session 的 `description_v2.txt`（如需可請 Claude 重出）。

> 提醒：除 Promotional Text 外，Title/Subtitle/Keywords/Description 改動都需綁**新版本 + 送審**（非即時）。

---

## 三、送審前還要做的事 ⬜（依重要性）

### 🔴 1. Screenshots（唯一主要剩餘 blocker，最花工）
- 目前 **0 張**，需 **4–6 張**。
- 規格：**6.9" 機型，1320 × 2868 px，portrait，PNG/JPEG，無 alpha**。
- 從 **iPhone 17 Pro Max simulator** 截。建議畫面：bartender（主推薦）、scan（讀酒櫃）、my bar（庫存）、taste DNA、Smart Restock。
- 這是進度上最大的一塊，建議新 chat 優先處理。

### 🟡 2. 送審機制性項目（新 chat 請逐項向 Brok 確認是否已完成）
首次送審除了上面，通常還需要：
- [ ] **Build 已上傳**（EAS Build 產 .ipa → 上傳 → 綁到這個 version）
- [ ] **App Review Information** 填好：demo 帳號 `sipmetry.review@gmail.com` / `Review2026!`、聯絡資訊、給 reviewer 的 notes
- [ ] **Export Compliance**（加密問題；一般 app 用標準加密 → 多半可選豁免）
- [ ] **Pricing and Availability**：Free、**US only**
- [ ] **Content Rights**（是否含第三方內容）
- [ ] **Category**：Primary = Food & Drink
- [ ] 最後按 **Add for Review / Submit**

### 🟢 3. App Privacy 可選精修（非 blocker）
- 政策附錄列了 **User Content → Customer Support**（自由文字 feedback `/app-feedback`），目前可能被併進「Other User Content」。要更精準可單獨補一項（App Functionality、Linked Yes、Tracking No）。兩種做法都站得住，**不擋上架**。
- 補完後 ASC 標籤即與政策附錄 9 項完全一致。

---

## 四、Post-launch backlog（不擋上架，上線後再處理）

- **Supabase Dashboard 直接刪 user 會報 "Database error deleting user"**：某張 public table 的 FK 指向 `auth.users(id)` 缺 `ON DELETE CASCADE`。**不是 app bug**（app 內 Delete Account 正常，因它先清子表）。純 DB 整潔問題，找出是哪張表補 cascade。
- **avoidAllergens** 實作（目前 UI toggle 隱藏、state/save plumbing 保留；Safety Mode 其餘 4 flags 已 live）。
- `ingredient_ontology` 的 `rose_wine` accent key 修正。
- `feedback_events` table 清理（drop 前先確認 `server.js:3137` 的 read）。
- Filter UI 在 exploration mode 的可發現性（chips 藏在 "Narrow the list +" 後面）。
- Bartender hero text trim round 2（`ROUND_4_BACKLOG.md` 有 5 個方向，待產品決定）。
- Bartender excludes 前端 UI（後端 server.js:3222–3472 已實作，只缺 input layer）。
- 下個 EAS build 要含 Starter Bar Stage 3+4B 前端改動（OTA 尚未推）。

---

## 五、關鍵 reference

### 帳號 / URL / 路徑
- Demo 帳號：`sipmetry.review@gmail.com` / `Review2026!`（**保持可登入**）
- Support / Marketing URL：`https://sipmetry.app`
- Privacy Policy URL（ASC 已填）：`https://brok110.github.io/sipmetry-frontend/privacy`
- email-confirm 落地頁：`https://sipmetry.app/confirmed.html`
- 聯絡 email：`brok110@gmail.com`
- Repos（皆在 Brok 本機）：
  - Frontend：`~/Projects/sipmetry-20260128/`（Expo SDK 54 / EAS）+ GitHub `brok110/sipmetry-frontend`
  - Backend：`~/Projects/sipmetry-backend-20260122/`（Node/Express、Render Starter、push 自動部署）+ GitHub `brok110/sipmetry-backend`
  - 官網：`brok110/sipmetry-site`（純 HTML、CNAME = sipmetry.app）
- Supabase：`https://cuvkwqtdmzlcpidjzrgy.supabase.co`

### App Privacy 最終狀態（本次改完後，對齊政策附錄）
| Apple 類別 → 類型 | 用途 | Linked | Tracking |
|---|---|---|---|
| Contact Info → Email Address | App Functionality | Yes | No |
| Other Data Types（= birth year） | App Functionality + **Analytics** | Yes | No |
| User Content → Photos or Videos | App Functionality | No | No |
| User Content → Other User Content | Product Personalization + App Functionality | Yes | No |
| **Usage Data → Product Interaction**（新增） | Product Personalization + App Functionality | Yes | No |
| Identifiers → Device ID（push token） | App Functionality | Yes | No |
| Diagnostics → Performance Data | App Functionality | No | No |
| Diagnostics → Crash Data | App Functionality | No | No |
| （可選）User Content → Customer Support | App Functionality | Yes | No |

### 工作原則（沿用）
- 先 audit、讀實際檔案/DB 再下結論，不用猜。
- 一次一個決定；stage-gate；改動前先確認 blast radius。
- 標籤/文案要與已上線的隱私政策一致（reviewer 會對）。
- 只宣傳真正 end-to-end 可用的功能；warm「私人 bartender」語氣，不用 techy「decision engine」。

---

## 六、設計系統（OaklandDusk）速查
- Colors：`#07060E` void、`#C87828` brand gold（canonical logo 色）、`#E0A030` sundown、`#C04858` crimson/error
- Fonts：EB Garamond（display/title）、SF Pro（body）、DM Mono（labels/data）
- Tab 結構：`bartender` / `cart`(Smart Restock) / `inventory`(My Bar) / `profile`
