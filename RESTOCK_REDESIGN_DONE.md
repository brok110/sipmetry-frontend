# RESTOCK_REDESIGN_PLAN.md(2026-08-01 拍板定稿)

全案 = 主頁重設計 + cocktails 明細頁 + ingredient 說明頁 + WHATIF 搜尋 + 勾銷補名。
拍板紀錄:mockup v6 三頁 + WHATIF 三態(全數 Brok 確認);match 只藏不刪;+N 與名字雙 tap 區零視覺提示(驗收看發現性);酒櫃只管具名瓶。

## Stage 1:主頁重設計
**Goal**: cart.tsx — 去入口頁(直入自動載入)、卡片三元素版式(名字 tap 位保留、+N 裸字、全寬 Add)、去 chips 去 match、留白 16–32 階、hero「N more ›」可 tap。
**Files**: frontend `app/(tabs)/cart.tsx`
**Success**: tab 直入 loading→結果;卡片與 mockup v6 一致;Add 閉環行為不變;hero/+N tap 先接 no-op(S2 補導頁)。
**Status**: Not Started

## Stage 2:cocktails 明細頁
**Goal**: 新 route `app/restock-unlocks.tsx`(參數 = ingredient_key 或 all)。「{名} unlocks」+ 圖名 2 欄 grid(復用 browse/RecipeCard),tap → recipe 頁;hero 導聯集版。
**Backend**: `/restock-suggestions` recipes map 補 `image_url`(SELECT + map 各一行)+ regression。
**Files**: backend `server.js`;frontend 新檔 + `_layout.tsx` + cart.tsx 接跳轉。
**Status**: Not Started

## Stage 3:ingredient 說明頁(v1 推導版)
**Goal**: 新 route `app/ingredient-info.tsx`:名字 / 分類 / FLAVOR tags(12 維向量推導,取 top 值過門檻)/ 底部 Add 鈕。名字 tap 從 restock 卡導入。
**Backend**: 新 `GET /ingredient-info/:key`(唯讀,ingredients 單列)+ regression。
**Prose 子階段(不擋 v1)**: `description` 欄 DDL + 分批文案(先常見 30 支,LLM 草稿 Brok 審),頁面有值顯示無值略過。
**Status**: Not Started

## Stage 4:WHATIF 搜尋
**Goal**: cart.tsx 頂部搜尋列 + typeahead(catalog 名單,已擁有標 IN MY BAR)→ 結果卡兩態(未擁有 = 標準卡對單 key 算 +N;已擁有 = In My Bar · N% left + Add)。hero 隱藏 / YOUR SEARCH / SUGGESTED 降暗 / ✕ 復原。每次選定寫 interaction(具名購買意圖)。
**Backend**: `/restock-suggestions` 收 `target_key` 變體(對單 key 走同公式)+ regression。
**Status**: Not Started

## Stage 5:勾銷補名
**Goal**: shopping-list.tsx 酒類勾銷確認窗加「What did you buy?」文字欄(預填通用名/已擁有列現名,可改)+ Scan instead;`/check` 收 body `{display_name}` override 入櫃寫入(單點)+ regression。
**Status**: Not Started

## 通則
每段照舊:audit 現狀 → python 驗證 brief → Claude Code → 核對 → simulator 驗收 → 指名 add commit。全部留岸 1.0.2 OTA 軌道,發車聽 Brok。S1–S2 可連發;S3 prose 子階段與 S4/S5 依序,一段一批不併。
