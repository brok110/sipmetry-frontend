# AGE_GATE_COMPLIANCE_TASK.md

**目標：** 更新 TOS 和 Privacy Policy 以反映 age gate 功能
**執行工具：** Cowork
**Files:** `docs/terms.md`, `docs/privacy.md`（在 sipmetry-20260128 repo）

---

## Task 1: 更新 TOS Section 4

**File:** `docs/terms.md`

找到 Section 4 的段落：

```bash
grep -n "intended for users aged 17" docs/terms.md
```

將整個段落：

```
Sipmetry is intended for users aged 17 and older. By using the app, you confirm that you meet this age requirement. Sipmetry does not encourage or facilitate the purchase or consumption of alcohol by minors.
```

替換為：

```
Sipmetry requires users to meet the legal drinking age in their jurisdiction (21 in the United States, 20 in Japan, 18 in most other countries). The app includes an age verification step at sign-up. By using the app, you confirm that you meet the applicable age requirement. Sipmetry does not encourage or facilitate the purchase or consumption of alcohol by minors.
```

同時更新檔案頂部的 `Last updated` 日期為 `April 3, 2026`。

**驗證：**
```bash
grep -n "legal drinking age" docs/terms.md
grep -n "April 3, 2026" docs/terms.md
```

---

## Task 2: Privacy Policy — 加入 Age Verification 段落

**File:** `docs/privacy.md`

找到 `### Bar Inventory` 的位置：

```bash
grep -n "### Bar Inventory" docs/privacy.md
```

在 `### Bar Inventory` 這行的**前面**，插入以下完整段落（包含空行）：

```
### Age Verification
During your first sign-in, we collect your birth year and device region (country code) to verify that you meet the legal drinking age in your jurisdiction. Your birth year is stored in our database for age verification and aggregate analytics (such as understanding the age distribution of our users). Your birth month is used only for the one-time age calculation and is not stored. We do not collect your full date of birth.

```

注意：段落末尾要有一個空行，然後才是 `### Bar Inventory`。

**驗證：**
```bash
grep -n "### Age Verification" docs/privacy.md
grep -n "birth year" docs/privacy.md
```

---

## Task 3: Privacy Policy — 更新 Section 6 Children's Privacy

**File:** `docs/privacy.md`

找到 Section 6 的第一句：

```bash
grep -n "rated 17+ and is not intended" docs/privacy.md
```

將：

```
Sipmetry is an alcohol-related application rated 17+ and is not intended for use by anyone under the age of 17.
```

替換為：

```
Sipmetry is an alcohol-related application and is not intended for use by anyone under the legal drinking age in their jurisdiction. The app includes an age verification step that prevents underage users from accessing the app.
```

**驗證：**
```bash
grep -n "age verification step" docs/privacy.md
```

---

## Task 4: Privacy Policy — Appendix 表格加一行

**File:** `docs/privacy.md`

找到 Appendix 表格裡 `Contact Info | Email Address` 那行：

```bash
grep -n "Contact Info | Email Address" docs/privacy.md
```

在那行的**下一行**，插入：

```
| Demographics | Age (birth year) and Region (country code) | App Functionality, Analytics | Yes | No |
```

**驗證：**
```bash
grep -n "Demographics" docs/privacy.md
```

---

## Task 5: 更新 Privacy Policy 日期

**File:** `docs/privacy.md`

將檔案頂部的 `Last updated: March 21, 2026` 改為 `Last updated: April 3, 2026`。

**驗證：**
```bash
grep -n "April 3, 2026" docs/privacy.md
```

---

## Final Verification

全部完成後：

```bash
grep -c "legal drinking age" docs/terms.md
grep -c "Age Verification" docs/privacy.md
grep -c "Demographics" docs/privacy.md
grep -c "April 3, 2026" docs/terms.md docs/privacy.md
```

預期結果：
- `legal drinking age` 在 terms.md 出現 1 次
- `Age Verification` 在 privacy.md 出現 1 次
- `Demographics` 在 privacy.md 出現 1 次
- `April 3, 2026` 在兩個檔案各出現 1 次

**DO NOT:**
- 不要改動任何其他 section 的內容
- 不要改動 markdown 格式或連結
- 不要重新排版段落

**Commit：**
```
git add docs/terms.md docs/privacy.md && git commit -m "docs: update TOS and Privacy Policy for age gate compliance"
```
