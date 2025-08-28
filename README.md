


# LINE Budget Bot (Google Apps Script)

一個用 LINE OA + Google Sheet 記帳／查詢的小機器人。  
**重點：此 Repo 不含任何敏感資訊**（Token、Secret、表單 ID、真實標的名稱），均以 **Script Properties** 注入。

---

```
line-budget-bot/
├─ README.md
├─ appsscript.json
└─ src/
   └─ bot.gs
```

## ✨ 功能摘要
- 指令解析（餐費紀錄、通用「加/設定/查」）
- Flex Message 主選單、教學、概覽輸出
- 模糊比對（Jaro–Winkler）自動對應欄位
- CSV 匯出到 Google Drive
- 使用者白名單（`ALLOWED_USERS`）
- LINE 簽章驗證（`X-Line-Signature`）

---
<img width="560" height="485" alt="image" src="https://github.com/user-attachments/assets/02190046-44f9-42f9-9519-a6f56d5b0f46" />


## 🛡️ 安全與隱私
- **不要**把 Token、Secret、Sheet ID 寫在原始碼；請改用 **Script Properties**。
- 任何真實的基金／股票／交易所名稱，請放在 **Script Properties** 裡的 JSON（`SETTABLE_FIELDS_JSON`、`MAP_OVERRIDE_JSON`）。
- 建議設定 `ALLOWED_USERS`（以逗號分隔的 UserID）限制使用者。

---

## ⚙️ 部署步驟（Google Apps Script）
1. 建立新專案 → 貼上 `src/bot.gs` 內容。  
2. 專案設定 → `appsscript.json` 替換為本 Repo 的檔案（或手動開啟 UrlFetch、Drive、Sheets、Cache、Properties 範圍）。  
3. **設定 Script Properties**（`設定 → 專案屬性 → 指令碼屬性`）：
   - `SPREADSHEET_ID`：你的 Google Sheet ID
   - `CHANNEL_ACCESS_TOKEN`：LINE Messaging API 的長期存取 Token
   - `CHANNEL_SECRET`：LINE Channel Secret
   - `ALLOWED_USERS`：允許使用的 LINE userId（可空），例如：`U123,U456`
   - （可選）`EXPORT_FOLDER_ID`：CSV 匯出的資料夾 ID
   - （可選）`HERO_IMG_ID`：首頁圖片的 Google Drive 檔案 ID
   - （可選）`MAIN_SHEET_NAME`：主資料工作表名（預設 `sheet1`）
   - （可選）`LOG_SHEET_NAME`：日誌工作表名（預設 `logs`）
   - （可選）`EXPORT_RANGE_A1`：匯出範圍（預設 `A1:K80`）
   - （可選）`SETTABLE_FIELDS_JSON`：可設定清單（**匿名化名稱**）
   - （可選）`MAP_OVERRIDE_JSON`：鍵 → A1 位址對應（**匿名化名稱**）

   ### 範例：`SETTABLE_FIELDS_JSON`
   ```json
   [
     ["Salary", 0], ["Rent", 9000], ["Phone", 599],
     ["Bank_A", 0], ["Bank_B", 0], ["Bank_C", 0], ["Bank_D", 0],
     ["Stocks_TWD", 0],
     ["Fund_A", 0], ["Fund_B", 0], ["Fund_C", 0],
     ["Exchange_A", 0], ["Exchange_B", 0], ["Exchange_C", 0], ["Exchange_D", 0]
   ]


### 範例：`MAP_OVERRIDE_JSON`

```json
{
  "累計餐費": "sheet1!K6",
  "剩餘餐費": "sheet1!L6",
  "Stocks_TWD": "sheet1!C21",
  "Fund_A": "sheet1!C25",
  "Fund_B": "sheet1!C26",
  "Fund_C": "sheet1!C27",
  "Exchange_A": "sheet1!C32",
  "Exchange_B": "sheet1!C33",
  "Exchange_C": "sheet1!C34",
  "Exchange_D": "sheet1!C35",
  "Bank_A": "sheet1!I20",
  "Bank_B": "sheet1!I21",
  "Bank_C": "sheet1!I22",
  "Bank_D": "sheet1!I23",
  "總資產": "sheet1!J27",
  "報酬率": "sheet1!J28",
  "報酬":   "sheet1!J29"
}
```

4. 發佈 Web App：

   * `部署 → 新部署 → 類型選 Web 應用程式`
   * 存取權限（建議先測）：「任何擁有連結的人」
   * 將產生的 URL 填到 LINE OA 的 **Webhook URL**
   * 在 LINE Developers 後台啟用 Webhook。

---

## 🧪 指令與用法

* `首頁 / menu / 主選單`：顯示主選單（Flex）
* `功能 / 說明 / help`：顯示指令說明
* `設定`：打開可設定清單（兩段式）
* `設定 <項目>` → 再回覆一個金額（或 `取消`）
* `設定|修改 <項目> <金額>`：一次說清楚
* `把<項目>改成|調整為|=<金額>`：自然語句
* `加|新增|累計 <項目> <金額>`：累加模式
* `餐費 <數字>`：把數字加到 `累計餐費`
* `查 <項目>`：顯示數值（如：`查 總資產`）
* `輸出 概覽`：Flex 概覽 Carousel
* `輸出 CSV`：輸出 `EXPORT_RANGE_A1` 範圍到 Drive 並回傳連結

---

## 🧩 模組說明（對應原始碼）

* **入口**：`doPost`
  驗簽、解析事件、白名單、分派指令。
* **指令處理**：`handleCommand_`
  指令正則、餐費快指令、兩段式設定、通用 `加/設定/查`、CSV/概覽輸出。
* **UI**：`buildHomeFlex_ / buildHelpText_ / buildSettingMenu_ / buildMealFeeHelpFlex_ / buildSummaryFlex_`
  產生 Flex 內容、上色與數字格式化。
* **回覆**：`replyTextWithQR_ / replyFlexWithQR_ / lineReply_`
  統一附 Quick Reply，錯誤日誌輸出。
* **驗簽 & 工具**：`verifyLineSignature_ / normalize_ / formatNumber_ / toNumber_`
  LINE HMAC SHA-256 驗證、字串清理、格式化。
* **狀態管理**：`setPending_ / getPending_ / clearPending_`
  使用 `CacheService` 暫存「等待金額」狀態。
* **讀寫/模糊比對**：`findBestKey_ / readByKeySmart_ / writeByKeySmart_ / resolveTargetRange_ / autoLocateA1_`
  Jaro-Winkler 相似度、`MAP_OVERRIDE`（或自動定位 A1）。
* **CSV 匯出**：`exportCsv_ / toCsv_`
  將指定範圍輸出到 Drive，回傳 URL。
* **日誌**：`logChange_`
  記錄 `SET/ADD`、使用者、時間戳。

---

## 🧰 權限（Scopes）

* `https://www.googleapis.com/auth/script.external_request`
* `https://www.googleapis.com/auth/drive`
* `https://www.googleapis.com/auth/spreadsheets`
* `https://www.googleapis.com/auth/script.scriptapp`
* `https://www.googleapis.com/auth/script.container.ui`（視情況）

---

## ❗ 常見錯誤

* **403 / 401**：檢查 `CHANNEL_ACCESS_TOKEN` 是否正確、是否放到 Script Properties。
* **BAD\_SIGNATURE**：`CHANNEL_SECRET` 不一致；或有 Proxy 導致原文不同。
* **NO\_BODY**：Webhook 連到錯的 URL；或 LINE 後台未啟用。
* **找不到欄位**：`MAP_OVERRIDE_JSON` 未設定對應、或鍵名不一致。

---

## 📝 License

MIT



---



