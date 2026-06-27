# V2_ROADMAP.md

> Sipmetry V2 規劃文件。整合三次討論(option engine 轉向、首頁 Category Carousel、搜尋與 DB 擴充),並納入 `server.js` audit 後修正的階段 2 範圍。
> 範圍採「持續累積、喊停即定版」模式。本文件為 living doc,完成的 stage 標 `Complete`,全部完成後歸檔。

---

## 一、核心定位(已定)

從 **decision engine → option engine**。

**V2 的主軸 = 打造最好的 Browse Experience。** V2 只做好「逛」這件事:讓 user 一打開就想滑、滑得到值得看的酒、看得出自己能不能做。retention loop(讓首頁每天因 user 而變)的洞察是對的,但屬於 V3,不在 V2 範圍(見文末「產品分層」)。

不替 user 決定,而是把「依心情/情境瀏覽的所有 recipes」攤開,用 My Bar 在每張卡標示可做性,決定權留給 user。

- 核心 user:**有經驗、要靈感的人**(不是要材料反推的新手)
- 驗收標準:Brok 在非測試情況下自發開 app = PMF 前哨(dogfooding)
- 與舊定位的張力已解:首頁主入口定為 **Category Carousel**,心情只是其中可能的一列(非垂直無限滑的單一心情牆)


---

## 二、首頁:AI Category Carousel(已定方向)

取代現在的 `bartender` tab。改以多個橫向 Carousel 作為首頁主要瀏覽方式。
每一列主要代表一個**決策情境**(回答「我跟這杯的關係」),而非酒種。
同一杯可同時出現在多列(如 Netflix)。

> **待議:酒種列。** 列也可以含酒種(如「Gin 調酒」),細節待後續討論。需釐清的張力:決策情境列(Ready to Make、One Bottle Away…)每列都帶決策資訊;酒種列只回答「這是什麼基酒」,不帶可做性/適配資訊,本質偏**瀏覽輔助**而非決策情境。待決定酒種列是與決策列平起平坐,還是次一級的瀏覽分類。

### 架構(三層縮為兩層)

原規劃的「第三層 LLM/template 說明文字」**已砍除**。決議:Category 名稱本身即說明,「差哪一瓶」由卡片上的可做性訊號表達,不另開解釋句(囉嗦、且與 option engine 調性相反)。

1. **Recommendation Engine** — 算每杯分數與排序。零 OpenAI。
2. **Category Engine** — 對同一份排序用規則切子集成各列。零 OpenAI。

### 列分兩類(影響後端,見階段 2)

- **庫存導向列**:Ready to Make(missing = 0)、One Bottle Away(missing = 1)、Two Away(missing = 2)。受手上酒限制。
- **慾望導向列**:Discover Something New、Because You Loved… 等。**庫存碰不到也要顯示**(先被圖勾起慾望,再讓庫存告訴你能不能做)。**V2 首發要做。**

### V2 列數硬上限:5–6 列

每多一列都要 排序策略 + trigger + UI + analytics + 維護,數量會乘上去。**V2 最多 5–6 列。** 下面候選清單是腦力激盪池,不是 V2 全做清單;進 Stage 3 時從中選定 5–6 條。

額外取捨(來自 review):
- **「What's new in my bar」列(V2 要做)**:Living Homepage 的 rule-based 最小切片。inventory 最近有變動時,把「因此新解鎖/受影響的酒」聚成一列,讓 user 打開就看到首頁因他而變。不請 LLM —— missing 重算本來就會變,只是 UI 上讓它被看見。
- **Mood 降優先**:user 不會每天選 happy/sad,實際更常用的是 flavor / occasion / inventory。Mood 後端骨架(`recipe_moods`)已現成,留著當其中一列即可,**降優先 ≠ 移除**,別早投成本。
- **Discover 做激進**:不要只是 random recipe,要有故事感(如「98% Gin 玩家沒做過」「Forgotten Classics」「Hidden Gems」)。屬列的命名/規則設計,Stage 3 細部處理。

> 候選 Category 池(腦力激盪,非全做):Perfect for You、Ready to Make、One Bottle Away、Discover Something New、Because You Loved…、What's new in my bar、Haven't Made in a While、New With Your Latest Bottle、Finish These Bottles First、Impress Your Guests、Quick & Easy、Mood。Trending(社群)留待未來。

---

## 三、搜尋(後置,blast radius 最小)

與首頁主流程解耦,排在最後。

### 入口(已定):兩個 mode 走不同入口,不共用

Carousel 已取代 `bartender` tab、成為首頁主瀏覽頁,搜尋不另開 tab。

- **Mode B 的家 = Carousel 頁頂部一條 search bar。** 上面搜尋、下面分類列瀏覽,同一畫面(App Store / Netflix / Spotify 模式)。搜尋與 Carousel 是同一意圖的兩種強度:沒目標往下滑,有目標點上面搜。
- **Mode A 的家 = `scan` 流程。** 入口動作是「掃瓶子」不是「打字」,user 在朋友家不會打字輸入一堆酒。Mode A 應為 scan 頁裡的一個臨時模式(掃完 → 看能做什麼 → 不存 inventory),不塞進 search bar。
- **佔位策略**:Stage 3 先在 Carousel 頁放一條佔位 search bar(卡好版面位置,點下去進 placeholder),真正查找邏輯留到 Stage 4。避免 Stage 4 才硬塞一條 bar 打亂佈局。

### 兩個 mode 內容

- **Mode A(reverse search)**:V2 只做 **Case 1 純臨時唯讀**(朋友家掃酒 → 看能做什麼 → 不留痕跡、不碰 inventory)。Case 2 歸 Smart Restock 反向入口;Case 3/4 不做。
- **Mode B(forward search)**:「查 + 多維 filter」容器。B-1 名稱直查 + base spirit / style·flavor / exclude 三維 filter(三者後端皆已存在,exclude 缺前端 UI)。
- **more like this**(單品相似搜尋):backlog,V2 不做。

---

## 四、DB 擴充(可平行先跑)

120 → 200 杯(補廣度 + 補經典缺漏)。

- 真正瓶頸是 **ingredient_key 對應**,不是找酒譜。對不上的要先補 ontology。
- 來源:IBA Official(GitHub `rasmusab/iba-cocktails`,材料已結構化)優先補經典;TheCocktailDB 補廣度但免費 key **不可商用、授權待確認**;Diffords 自由文字 + 授權灰色,不採用。
- **前置卡點**:必須先倒出現有 120 杯清單(名稱 + 基酒)才能做差集找缺漏。Project 檔只有 count 無清單,此任務適合在 Claude Code 連真實 DB 做。

---

## 五、執行順序(魚骨圖)

```
                        1. 資料準備(平行)              3. 首頁 Carousel
                        ① 倒出 120 杯清單               ① 卡片 mockup
                        ② 差集找缺漏                    ② 可做性分級 2/3 級
                        ③ 補 ontology + DB→200          ③ 心情列 + 圖像瀏覽
                              \                              \
   先做 →→→ 後做 ──────────────●──────────────●──────────────●──────────────●──→ [V2 出貨]
                                            /                              /
                        2. 三層架構(地基)              4. 搜尋(後置)
                        ① 抽 scoring → lib              ① Mode A Case 1
                        ② 改舊 API + regression         ② Mode B filter
                        ③ 新增 /browse-recipes
                        ④ 接 mood filter
```

依賴關係:

- **1 與 2 從 day 1 平行啟動。** 資料準備不依賴前端決策;三層架構地基不必等資料到齊就能先驗證。
- **3 必須等 2 的地基。** 卡片要顯示可做性與排序,得先有階段 2 的後端。① 卡片 mockup 可早畫,② ③ 接真資料要等 2。
- **4 整條後置。** 與首頁解耦,不卡任何東西。

---

## 階段定義

### Stage 1: 資料準備
**Goal**: recipes 從 120 擴充到 200,ingredient_key 全對得上。
**Success Criteria**:
- 現有 120 杯清單已倒出(名稱 + 基酒),完成差集分析
- 新增酒譜的每個材料都對得上現有 ingredient_key,對不上的已補 ontology
- recipes 表達到約 200 杯,`run_regression.sh` 的 ontology health check 通過
**Tests**: 倒出清單後人工核對差集;新增後跑 `run_regression.sh` 確認 ontology 無 silent drop。
**Status**: Not Started
**Blocker**: 先在 Claude Code 連真實 DB 確認 `recipes` 表 schema,再倒清單。

### Stage 2: 後端兩層地基(已 audit、範圍已修正)
**Goal**: 提供一支能回「全目錄 flat 排序 + 每杯 missing」的查詢,供 Category Engine 切片;scoring 邏輯抽成共用 module。

**背景(audit 結論)**:
- `/recommend-classics` 的 missing 計算(`STRICT_MATCH` → `missing_count` + `missing_items`)已現成,可複用。
- 但它有 `HAVING overlap > 0`(只回與庫存有交集的酒)→ **慾望導向列供不了**;且已切成 `can_make`/`one_away`/`two_away` 三桶並各自截斷(12/10/8)→ 不是 flat 全量。
- scoring(`scorePreference` + `computeExplainableScore`)目前是 handler 內的 closure,**未抽成可獨立呼叫的 function**,且依賴區域常數 `DIM_WEIGHTS` / `PREF_DIMS` / `PREF_MID` / `scoring_dims`。
- mood filter 骨架已存在(`req.body.mood` → `recipe_moods` 表,`verified = true` 控管)。

**決議**:選路 A(抽 scoring 成共用 module),不選路 B(複製貼上),避免兩份 scoring 未來漂移。新增端點與舊 API 並存,不改舊 API 行為。

**範圍(四步)**:
1. 抽 `scorePreference` + `computeExplainableScore` + 相關常數(`DIM_WEIGHTS` / `PREF_DIMS` / `PREF_MID` / `scoring_dims` 來源)到 `lib/scoring.js`。
2. 改 `/recommend-classics` 改用 `import`,**行為零變化**。
3. 新增 `/browse-recipes`:複用 missing SQL 但拔掉 `HAVING overlap > 0` 與三桶切割,回 flat 全量排序,每杯帶 `missing_count` + `missing_items`,import `lib/scoring.js` 做排序。
4. `/browse-recipes` 接上 mood filter(複用現有 `recipe_moods` 骨架)。

**Success Criteria**:
- `lib/scoring.js` 抽出後,`/recommend-classics` 的回傳與抽取前逐欄位一致
- `/browse-recipes` 對「庫存完全碰不到的酒」也會回傳,且每杯帶正確 `missing_count` / `missing_items`
- 兩支 API 的 scoring 來自同一份 module,無重複邏輯
**Tests**:
- 抽 scoring 後跑 `./run_regression.sh`(64 API tests),確認 `/recommend-classics` 零回歸 —— 此為硬性 gate。
- `/browse-recipes` 對一個空 inventory / 與庫存無交集的 query 回傳非空且 missing 數正確。
- `npx tsc --noEmit` 通過後才上 simulator。
**Status**: Not Started

### Stage 3: 首頁 Category Carousel(前端)
**Goal**: 首頁以多列橫向 Carousel 呈現,庫存導向列與慾望導向列並存,卡片標示可做性。
**Success Criteria**:
- 卡片 mockup 經 Brok 確認後才動工
- 可做性分級數(2 級 vs 3 級)已拍板並落到卡片
- Category Engine 在前端對 `/browse-recipes` 的 flat 排序切出至少一個庫存導向列 + 一個慾望導向列
- 心情作為其中一列,接上 `/browse-recipes` 的 mood filter
- 列數控制在 **5–6 列上限**內
- 含一條 **What's new in my bar** 列(inventory 近期變動 → 聚成一列,rule-based 不請 LLM)
- 頁面頂部放一條**佔位 search bar**(卡好版面位置,點下去進 placeholder;真正查找邏輯在 Stage 4)
**Tests**: 多列不重複過量(同杯跨列可接受,但維持探索感);可做性標示與實際 inventory 一致。
**Status**: Not Started
**待決(進 Stage 3 前拍板)**:① 可做性分級 2/3 級 ② 心情清單怎麼定義與維護 ③ 各 Category 排序規則與觸發條件 ④ 卡片 mockup ⑤ 不同使用者(新手/進階/重度)是否需要個人化 Category ⑥ 酒種列是否納入、以何種層級納入 ⑦ 從候選池選定哪 5–6 列。

### Stage 4: 搜尋(後置)
**Goal**: 提供瀏覽之外的主動查找路徑。Mode A 走 `scan`,Mode B 接 Stage 3 的佔位 search bar。
**Success Criteria**:
- Mode A Case 1(入口 = `scan` 臨時模式):掃酒 → 看能做什麼 → 不寫 inventory、不留痕跡
- Mode B(入口 = Carousel 頁頂 search bar):名稱直查 + base spirit / style·flavor / exclude 三維 filter,exclude 補上前端 UI
**Tests**: Case 1 確認無任何 inventory 寫入;Mode B 各 filter 維度回傳正確交集。
**Status**: Not Started

---

## 產品分層(V2 / V3 / V4)

定位:Sipmetry 不是酒譜 App,而是 **Home Bar Operating System**。首頁是這個系統的儀表板。

- **V2 — 打造最好的 Browse Experience(現在做)**:rule-based Carousel,首頁「內容」會隨資料變(inventory 變 → missing 重算 → 列內容變)。
- **V3 — 會成長的 Homepage(北極星,不在 V2 範圍)**:首頁「結構」會變 —— AI 決定每天該有哪些列(Tonight's Picks、Weekend Party、Use Your Rye…)。這把 LLM 請回首頁,成本模型要重算。**前置條件**:V2 的 rule-based 首頁先證明 user 真的會逛(達成 Conv 2 驗收:Brok 自發開 app),再啟動。
- **V4 — Community(更遠)**:UGC、分享、Trending。

**為什麼 V3 不併進 V2**:這正是本文件開頭警告的 scope creep,只是換成更高級的形式。retention loop 的洞察對(「為什麼一週後還會再打開」),但 V2 先用最便宜的 rule-based 切片(What's new in my bar 列)驗證方向;LLM 決定列結構是 V3 的核心,不是 V2 的待辦。

> 分界一句話:**V2 = 首頁內容會變(rule-based);V3 = 首頁結構會變(AI 決定有哪些列)。** 前者便宜、現在能做;後者貴、要驗證後才值得。

---

## Backlog(V2 不做)

- AI-driven Living Homepage(LLM 決定每天有哪些列)→ 已升格為 **V3 北極星**(見上)
- UGC 平台方向(高風險新產品,與 option engine 定位衝突;最難的 user 自由文字 → ingredient_key 列最底層)→ 歸 **V4**
- Smart Restock Case 2(what-if 買酒前試算,為 Smart Restock 反向入口)
- more like this(單品相似搜尋)
- Mode A Case 3 / Case 4(inventory 寫入/覆蓋,blast radius 大)
- 第三層說明文字(LLM 與 template 皆不做)

---

## 附:OpenAI 成本配置原則

首頁推薦與 Category Carousel 幾乎全部用 Recommendation Engine + rule-based Category Engine 完成,不頻繁呼叫 LLM。AI 成本投在更值得的地方:圖片辨識、AI 創意調酒生成、自然語言 Bartender 對話、Smart Restock 個人化解釋。
