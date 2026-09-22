# AppSheet 前端介面與人機協同配置手冊 (AppSheet Setup Guide)

本手冊專為「專櫃水電抄表自動化系統 (Counter Utility Meter App)」之前端 AppSheet 打造，提供完整之資料表結構、欄位公式、卡片清單 (Deck View)、視覺紅綠燈 (Format Rules) 與動作按鈕 (Actions) 之設定規範。

---

## 📱 一、 核心動線與使用者體驗 (Ergonomics)

現場巡檢作業講求**極致順手**與**零打字負擔**：
1. **每期前置（月結滾動）**：抄表前於 App 或試算表點擊【📅 一鍵生成下期主表骨架】，系統自動將上期度數結轉為前期度數，本期留白。
2. **連續拍照（無痛批次）**：巡檢員在賣場走動時，點擊【📷 批次拍照上傳】直接喚起 Google Drive 待處理資料夾，連續快速拍攝 20~30 顆儀表。
3. **背景辨識（AI 運算）**：返回 App 點擊【🤖 啟動 AI 辨識】，後端 Gemini 3.8 Flash 於 5~10 秒內依貼紙提取櫃位代碼、名稱、表別與度數，並比對前期用量。
4. **移動中滑動複核（卡片流 Deck View）**：
   - 🟢 **綠燈合格卡片**：AI 辨識成功且用量合理 ➔ 免動手，自動通過。
   - 🚨 **紅燈警示卡片**：辨識異常、非 kWh 畫面或度數逆轉 ➔ 點開卡片放大照片，手動鍵入數字後儲存。
5. **一鍵過帳（安全入帳）**：點擊【✅ 一鍵確認過帳】，將所有審核通過的度數正式回填至計費主表。

---

## 🗄️ 二、 資料表權限設定 (Data Tables)

在 AppSheet 的 **Data > Tables** 載入以下三張工作表：

| 資料表名稱 | 角色定位 | AppSheet 權限 (Table Mode) | 說明 |
| :--- | :--- | :--- | :--- |
| **`抄表待審核_Queue`** | 暫存核對表 (主要工作區) | **Adds, Updates, Deletes, Reads** | 供巡檢員檢視卡片、手動修改覆核度數與確認狀態 |
| **`櫃位主檔_Master`** | 專櫃與撤櫃日期主檔 | **Adds, Updates, Reads** | 管理員維護專櫃清單、專櫃狀態與撤櫃日期 |
| **`水電軌道燈紀錄_Log`** | 財務計費主表 (SSOT) | **Read-Only (唯讀)** | 僅供比對歷史前期度數，嚴禁前端直接編輯 |

---

## 📊 三、 資料表欄位型態與公式設定 (Columns Schema)

### 1. `抄表待審核_Queue`

進入 **Data > Columns > 抄表待審核_Queue**，依序設定欄位屬性：

| 欄位名稱 | Type | Key? | Label? | Formula / Initial Value | Editable? | 備註說明 |
| :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| `ID` | Text | ✅ | ❌ | Initial: `UNIQUEID()` | ❌ | 系統唯一流水碼 |
| `上傳時間` | DateTime | ❌ | ❌ | Initial: `NOW()` | ❌ | 照片拍照/上傳時間 |
| `照片` | Image | ❌ | ❌ | 無 | ❌ | 儀表照片預覽圖 |
| `專櫃代碼` | Text | ❌ | ❌ | 無 | ✅ | 例如 `00066` |
| `專櫃名稱` | Text | ❌ | ✅ | 無 | ✅ | 卡片主要標題，例如 `BAW` |
| `儀表類別` | Enum | ❌ | ❌ | Values: `110V電表`, `220V電表`, `水表` | ✅ | 卡片副標題 |
| `前期度數` | Number | ❌ | ❌ | 無 | ❌ | 前期歷史度數 |
| `AI辨識度數` | Number | ❌ | ❌ | 無 | ❌ | Gemini 辨識初值 |
| `人工覆核度數` | Number | ❌ | ❌ | Initial: `[AI辨識度數]` | ✅ | **同仁手動修正欄位**（預設帶 AI 值） |
| `本期用量` | Number | ❌ | ❌ | Formula: `[人工覆核度數] - [前期度數]` | ❌ | 自動計算當期耗用度數 |
| `審核狀態` | Enum | ❌ | ❌ | Values: `待審核`, `正常`, `異常`, `已過帳`, `已撤櫃` | ✅ | 預設為 `待審核` |
| `審核備註` | LongText | ❌ | ❌ | 無 | ✅ | 記錄模型版本、警示訊息或人工備忘 |
| `抄表員` | Text | ❌ | ❌ | Initial: `USEREMAIL()` | ❌ | 操作紀錄與追蹤 |

### 2. `櫃位主檔_Master`

進入 **Data > Columns > 櫃位主檔_Master**，設定專櫃與撤櫃日期屬性：

| 欄位名稱 | Type | Key? | Label? | Formula / Initial Value | Editable? | 備註說明 |
| :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| `專櫃代碼` | Text | ✅ | ❌ | 無 | ✅ | 專櫃唯一編號（如 `00066`） |
| `專櫃名稱` | Text | ❌ | ✅ | 無 | ✅ | 專櫃名稱（如 `BAW`） |
| `專櫃狀態` | Enum | ❌ | ❌ | Values: `在櫃`, `已撤櫃` | ✅ | 預設為 `在櫃` |
| `撤櫃日期` | Date | ❌ | ❌ | 無 | ✅ | **撤櫃日期**（若未撤櫃請留空） |
| `備註` | LongText | ❌ | ❌ | 無 | ✅ | 備註說明 |

---

## 🎨 四、 視覺紅綠燈防呆規則 (Format Rules)

進入 **UX > Format Rules**，建立三組色彩視覺提示，讓異常一目了然：

### 1. 🚨 紅燈警示 (Red Alert - 需人工介入)
- **Rule Name**：`警示_度數異常或逆轉`
- **For this data**：`抄表待審核_Queue`
- **Condition (If this condition is true)**：
  ```excel
  OR(
    [審核狀態] = "異常",
    [本期用量] < 0,
    ISBLANK([人工覆核度數])
  )
  ```
- **Format visual**：
  - Text Color：**紅色 (Red / #EF4444)**
  - Highlight Color：**淺粉紅 (#FEE2E2)**
  - Icon：⚠️ 或 🚨
  - Format columns：`[審核狀態]`, `[本期用量]`, `[人工覆核度數]`, `[審核備註]`

### 2. 🟢 綠燈合格 (Green Pass - 免動手快速通關)
- **Rule Name**：`合格_正常用量`
- **For this data**：`抄表待審核_Queue`
- **Condition**：
  ```excel
  AND(
    [審核狀態] <> "異常",
    [審核狀態] <> "已過帳",
    [本期用量] >= 0,
    ISNOTBLANK([人工覆核度數])
  )
  ```
- **Format visual**：
  - Text Color：**綠色 (Green / #10B981)**
  - Icon：✅
  - Format columns：`[審核狀態]`, `[本期用量]`

### 3. ⚪ 灰燈歸檔 (Gray Archive - 已過帳完成)
- **Rule Name**：`封存_已完成過帳`
- **For this data**：`抄表待審核_Queue`
- **Condition**：`[審核狀態] = "已過帳"`
- **Format visual**：
  - Text Color：**灰色 (#94A3B8)**
  - Icon：📁
  - Format columns：`[專櫃名稱]`, `[審核狀態]`

---

## 🖼️ 五、 視圖設計 (UX Views)

### 1. 主工作台：待審核清單 (Deck View)
- **View Name**：`待審核抄表清單`
- **For this data**：`抄表待審核_Queue`
- **View Type**：**Deck**
- **Position**：`Primary` (左下第一個主要導覽頁)
- **View Options**：
  - **Primary header**：`[專櫃名稱]`
  - **Secondary header**：`[儀表類別]`
  - **Summary column**：`[本期用量]`
  - **Image column**：`[照片]`
  - **Main image shape**：`Square` (正方形便於看清表具與貼紙)
- **Sort by**：`[審核狀態]` Descending, `[上傳時間]` Descending

### 2. 專櫃主檔管理台 (Table View - 替換原本的 Statistics 視圖)
- **說明**：若 AppSheet 預設建立了 `Statistics` 圖表視圖，可直接點擊該視圖並進行修改（或點右上角 🗑️ 刪除）。
- **View Name**：`專櫃主檔` (可直接覆蓋原 `Statistics`)
- **For this data**：`櫃位主檔_Master`
- **View Type**：**Table** (表格) 或 **Deck** (卡片)
- **Position**：`Menu` 或 `Primary`
- **Display Icon**：`storefront` 或 `business`

### 3. 歷史封存台：已過帳清單 (Table View)
- **View Name**：`歷史過帳紀錄`
- **For this data**：`抄表待審核_Queue`
- **View Type**：**Table**
- **Show if**：`[審核狀態] = "已過帳"`
- **Position**：`Menu`

---

## ⚡ 六、 自訂動作按鈕 (Actions)

進入 **Behavior > Actions**，建立以下核心業務按鈕：

### 1. 【📷 批次拍照上傳】(Batch Upload Photos)
- **For a record of table**：`抄表待審核_Queue`
- **Do this**：`External: go to a website`
- **Target**：
  ```excel
  "https://drive.google.com/drive/folders/<YOUR_PENDING_FOLDER_ID>"
  ```
  *(註：請替換為 Google Drive「待處理照片區」資料夾之真實 URL)*
- **Prominence**：`Display prominently` (顯著置頂按鈕)
- **Icon**：`camera` (相機圖示)

### 2. 【🤖 啟動 AI 辨識】(Trigger AI OCR)
- **For a record of table**：`抄表待審核_Queue`
- **Do this**：`External: go to a website` 或 `Call a webhook`
- **若使用 Webhook**：
  - URL：`<YOUR_GAS_WEBAPP_URL>`
  - HTTP Verb：`POST`
  - HTTP Content Type：`JSON`
  - Body Template：
    ```json
    {
      "action": "processPhotos",
      "limit": 20
    }
    ```
- **若使用外部連結 (簡易點擊方式)**：
  - Target：`"<YOUR_GAS_WEBAPP_URL>?action=processPhotos&limit=20"`
- **Prominence**：`Display prominently`
- **Icon**：`auto_awesome` 或 `smart_toy` (機器人/AI 圖示)

### 3. 【✅ 一鍵確認過帳】(Post Verified Readings)
- **For a record of table**：`抄表待審核_Queue`
- **Do this**：`External: go to a website` 或 `Call a webhook`
- **URL / Target**：
  ```excel
  "<YOUR_GAS_WEBAPP_URL>?action=postVerified"
  ```
- **Prominence**：`Display prominently`
- **Icon**：`publish` 或 `cloud_done`
- **Confirmation Message**：`確定將所有審核合格的度數回填至財務主表嗎？`

### 4. 【📅 生成下期主表骨架】(Roll-Forward Month)
- **For a record of table**：`抄表待審核_Queue`
- **Do this**：`External: go to a website` 或 `Call a webhook`
- **URL / Target**：
  ```excel
  "<YOUR_GAS_WEBAPP_URL>?action=initNextMonth"
  ```
- **Prominence**：`Display in display overlay` 或選單中
- **Icon**：`calendar_month`
- **Confirmation Message**：`確定將最新期數結轉，建立下期新抄表骨架嗎？`

### 5. 【🔄 單筆重新辨識】(Inline Action)
- **For a record of table**：`抄表待審核_Queue`
- **Do this**：`Call a webhook`
- **URL**：`<YOUR_GAS_WEBAPP_URL>`
- **HTTP Verb**：`POST`
- **Body Template**：
  ```json
  {
    "action": "processSingle",
    "recordId": "<<[ID]>>"
  }
  ```
- **Prominence**：`Display inline` (掛在卡片上)
- **Icon**：`refresh`

---

## 🔒 七、 安全與防呆檢核表 (Pre-Flight Checklist)

在 AppSheet 正式上線前，請確認以下事項：
- [ ] 主表 `水電軌道燈紀錄_Log` 權限是否確實為 **Read-Only**？
- [ ] 暫存表 `抄表待審核_Queue` 是否開放 **Adds, Updates, Deletes**？
- [ ] 動作按鈕之 `<YOUR_GAS_WEBAPP_URL>` 與資料夾連結是否已替換為您部署之真實端點？
- [ ] 試算表 `抄表待審核_Queue` 的「照片」欄位是否能正常縮圖呈現？
- [ ] 測試一張模糊照片，驗證 Format Rules 是否成功亮起紅燈 🚨？
