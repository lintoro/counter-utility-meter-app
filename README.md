# Counter Utility Meter App (專櫃水電抄表自動化系統)

本專案為商場專櫃公用事業（110V 電表、220V 電表、水表）現場巡檢抄表、AI 影像辨識、人機協同核對與試算表自動登錄的微服務系統。

---

## 核心痛點與設計哲學

### 現場巡檢的人體工學 (Ergonomics)
- **拒絕「拍一個輸入一個」**：在賣場走動巡檢時，同仁一手拿手電筒、一手拿手機，中斷拍照去打字會嚴重拖慢節奏。
- **最佳動線**：
  1. **每期前置**：在試算表工具列點擊「📅 一鍵生成下期主表骨架 (月結滾動)」，自動將上期本期度數結轉為下期前期度數，並產生待抄表列。
  2. **連續拍照**：在一個區域內專注把所有水電表拍完。
  3. **App 內一鍵上傳**：從 AppSheet 內直接喚起專屬 Google Drive 待處理資料夾，全選上傳後返回 App。
  4. **手動觸發 AI 辨識**：上傳完畢回到 App 點擊按鈕，背景使用 Gemini 3.8 Flash 快速辨識貼紙與讀數，並計算前期用量差額。
  5. **移動空檔複核**：搭電梯或回辦公室途中，在手機上滑動待審核清單。正常綠燈免動，異常/模糊紅燈點開照片手動補上度數。
  6. **一鍵確認過帳**：確認無誤後，正式將合格度數與本期抄表日寫入核心計費主表。

---

## 雲端架構與環境配置

依據資安規範，本專案所有實體資源 ID 均透過環境設定管理，絕不硬編碼：

- **試算表資料庫**：
  採用雙表解耦架構（計費主檔 `水電軌道燈紀錄_Log` 與操作暫存表 `抄表待審核_Queue`）。
  開發與測試限定於獨立副本試算表進行。
- **Google Drive 資料夾配置**：
  - **待處理照片區** (`FOLDER_PENDING_ID`)：巡檢人員連續拍攝上傳之緩衝區。
  - **已完成歸檔區** (`FOLDER_ARCHIVED_ID`)：辨識合格並完成建檔之照片儲存區。
  - **異常待複查區** (`FOLDER_REVIEW_ID`)：辨識模糊、非 kWh 畫面或度數逆轉等照片儲存區。
- **AI 影像辨識引擎**：
  採用 Google Gemini 3.8 Flash 多模態模型，透過 GAS 指令碼屬性 `GEMINI_API_KEY` 調用。

詳細環境變數設定方式請參閱 [`.env.example`](file:///.env.example) 與 [`.clasp.json.example`](file:///.clasp.json.example)。

---

## 目錄架構

```text
counter-utility-meter-app/
├── README.md                   # 專案總覽與動線說明
├── ARCHITECTURE.md             # 詳細資料庫架構、欄位對應與防呆規格
├── AGENTS.md                   # AI Agent 行為規範、安全守則與業務規則
├── PROGRESS.md                 # 系統開發進度與階段 Roadmap
├── ISSUES_LOG.md               # 問題排查與修復日誌
├── PROJECT_HANDOVER.md         # 專案交接與部署維運手冊
├── .env.example                # 環境變數設定範本
├── .clasp.json.example         # Clasp 部署設定範本
├── gas/                        # Google Apps Script 後端微服務原始碼
│   ├── appsscript.json         # GAS 權限清單與設定檔
│   └── Code.js                 # 核心業務邏輯、Gemini 辨識與月結滾動腳本
└── docs/
    └── PROJECT_CONVERSATION_HISTORY.md  # 專案對話與架構決策歷程紀錄
```
