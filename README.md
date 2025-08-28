# LINE Budget Bot (Google Apps Script)

一個用 LINE OA + Google Sheet 記帳／查詢的小機器人。  
**重點：此 Repo 不含任何敏感資訊**（Token、Secret、表單 ID、真實標的名稱），均以 **Script Properties** 注入。

---

## ✨ 功能摘要
- 指令解析（餐費紀錄、通用「加/設定/查」）
- Flex Message 主選單、教學、概覽輸出
- 模糊比對（Jaro–Winkler）自動對應欄位
- CSV 匯出到 Google Drive
- 使用者白名單（`ALLOWED_USERS`）
- LINE 簽章驗證（`X-Line-Signature`）

---

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
