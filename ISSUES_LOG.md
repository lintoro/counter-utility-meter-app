# 問題排查與修復日誌 (Issues Log & Troubleshooting)

本文件專門記錄本專案在開發、串接與維運過程中遇到的重大錯誤、坑點診斷、根因分析與解決方案。

---

## 🐞 歷史問題清單

### ISSUE-001: 全域 PreToolUse Hook 造成所有工具調用中斷
- **發生日期**：2026-09-22
- **嚴重等級**：Critical（阻斷所有 AI 工具調用）
- **錯誤現象**：
  ```text
  JSON hook "jsonhook__googlecloudtools.datacloud_telemetry_PreToolUse_0_0" failed:
  Error: Cannot find module 'C:\Users\B111014\.gemini\config\plugins\googlecloudtools.datacloud_telemetry\"C:\Users\B111014\.gemini\config\plugins\googlecloudtools.datacloud_telemetry\telemetry_hook_bundle.js"'
  ```
- **根因分析**：
  在 Windows 環境下，`googlecloudtools.datacloud_telemetry` 外掛在配置命令列時，路徑字串被重複套用雙引號（`\"...\"`），導致 Node.js 無法正確解析檔案路徑而 exit 1。Antigravity 的 Hook 機制在 PreToolUse 階段失敗時會強制中斷工具執行。
- **解決方案**：
  在 PowerShell 中將該外掛目錄移出 `plugins` 目錄：
  ```powershell
  Move-Item "$HOME\.gemini\config\plugins\googlecloudtools.datacloud_telemetry*" "$HOME\" -Force
  ```
- **狀態**：🟢 已解決 (Resolved)

---

### ISSUE-002: AI 儀表類別誤判與貼紙定位修正
- **發生日期**：2026-09-22
- **嚴重等級**：High（影響 AI 辨識準確率與業務邏輯真實性）
- **錯誤現象**：
  初期腳本單純依靠照片檔名猜測專櫃，且未要求 AI 定位表具上的識別標籤，導致將電表誤判為水表、同專櫃重複產生多張水表，並得出荒謬的用量數據。
- **根因分析**：
  1. 現場水電表每一顆表均有張貼制式貼紙（印有 QR Code 及 『| 專櫃編號 | 專櫃名稱 | 儀表類別 |』，例如 『| 00066 | BAW | 110 |』）。
  2. 專櫃不一定只有一顆電表或水表，不能做粗暴的一對一防呆。
  3. 未以貼紙為最高 SSOT，導致 AI 純靠圖像推測產生幻覺。
- **解決方案**：
  1. 重構 Prompt 為【貼紙優先定位】架構：第一步強制定位並提取貼紙文字（專櫃代碼、名稱、儀表類別 110/220/水），以此為 SSOT 比對主表。
  2. 移除「一櫃僅有一表」的不當防呆，全面支援複數分表。
  3. 導入主表 202608 期數歷史真值比對：
     - BAW (00066) 110V：AI 辨識 6450 ➔ 主表 202608 恰為 6450（100% 吻合）。
     - ISFN (00047) 110V：AI 辨識 1891 ➔ 主表 202608 恰為 1891（100% 吻合）。
     - 胜之鑰 (00048) 110V：AI 辨識 11853 ➔ 主表 202608 恰為 11853（100% 吻合）。
- **狀態**：🟢 已解決 (Resolved)

---

### ISSUE-003: 抄表週期斷層與月結滾動骨架需求
- **發生日期**：2026-09-22
- **嚴重等級**：High（業務流程不可或缺）
- **錯誤現象**：
  每個月進行抄表前，主表必須先存在該期的基本資料（上個月抄的本期度數要變成這個月的前期度數，且本期度數留白）。若無此結構，AI 辨識完後會找不到對應的期數儲存格寫入。
- **根因分析**：
  財務計費主表採列式（按期別）滾動累計。若未自動帶出下期骨架，抄表人員與自動化後端無從比對前期度數，也無法計算本期用量。
- **解決方案**：
  1. 在 `gas/Code.js` 實作 `initializeNextMonthLog()`：
     - 自動定位主表最新期（如 `202609`）。
     - 算出下一期年月（如 `202610`）。
     - 將最新期各櫃的本期度數結轉為下一期的前期度數，本期度數與抄表日留白。
     - 加入防呆保護：最新期若尚未過帳任何度數，禁止空轉生成下下期；若目標期數已存在，亦禁止重複生成。
  2. 掛載於試算表工具列【⚡ 專櫃水電系統 > 📅 一鍵生成下期主表骨架 (月結滾動)】。
- **狀態**：🟢 已解決 (Resolved)

---

### ISSUE-004: GitHub 託管與異地開發資安規範治理
- **發生日期**：2026-09-22
- **嚴重等級**：Critical（防止敏感資源與憑證外洩）
- **錯誤現象**：
  日誌與說明文件中曾出現具體之試算表 ID、雲端硬碟資料夾 ID 與 API Key，若推送到公開或私有 GitHub Repository，將存在資安洩漏風險。
- **根因分析**：
  早期為測試便利在本地腳本與 Markdown 中記錄了真實 ID。
- **解決方案**：
  1. 全面盤點專案內所有檔案，使用正則搜尋徹底清查。
  2. 將 Markdown 文件（`README.md`、`PROJECT_HANDOVER.md`、`ARCHITECTURE.md` 等）中的具體 ID 替換為標準佔位符（`<YOUR_SPREADSHEET_ID>` 等）。
  3. 將敏感 ID 與 API Key 透過雲端 `PropertiesService.getScriptProperties()` 私密儲存，GAS 代碼改為安全動態讀取。
  4. 健全 `.gitignore`，徹底排除 `.clasp.json`、`scripts/`、`downloaded_photos/` 及敏感憑證。
- **狀態**：🟢 已解決 (Resolved)

---

### ISSUE-005: AppSheet 圖片顯示 ⚠️ 驚嘆號與按鈕彈出外部網頁問題
- **發生日期**：2026-09-22 ~ 2026-09-23
- **嚴重等級**：Medium（使用者體驗問題）
- **錯誤現象**：
  1. 在 AppSheet 介面中，`抄表待審核_Queue` 照片欄位呈現灰色 ⚠️ 驚嘆號圖示，無法渲染縮圖與點擊放大。
  2. 點擊 AppSheet Action 按鈕會跳出外部 GAS 網頁（「AI 辨識已成功完成」），無法自動關閉。
- **根因分析**：
  1. Google Drive 照片預覽 URL 原先使用 `https://drive.google.com/uc?export=view&id=FILE_ID`，但在 AppSheet 嵌入時若檔案權限或 CDN 快取限制，會被瀏覽器安全標頭攔截。
  2. Action 按鈕設為 `External: go to a website`，點擊即喚起新分頁。
- **解決方案**：
  1. 將 `Code.js` 生成之照片 URL 格式升級為 Google 官方高畫質直連 CDN 格式：`https://lh3.googleusercontent.com/d/FILE_ID`，並且提醒將 Google Drive 資料夾權限開啟為「知道連結的任何人皆可檢視」。
  2. 將 AppSheet 動作按鈕或自動化改為 **`Call a webhook`** 或 **AppSheet Automation Bot**，讓 HTTP 請求 100% 在背景發送，實現無感原生體驗。
- **狀態**：🟢 已解決 (Resolved)

---

### ISSUE-006: 專櫃主檔工作表名稱相容性與動態表頭對齊 (`def_櫃位主檔_Master`)
- **發生日期**：2026-09-23
- **嚴重等級**：High（影響已撤櫃/非主檔專櫃自動防呆結果）
- **錯誤現象**：
  後端原本寫死尋找 `櫃位主檔_Master` 工作表，但使用者實際資料庫之工作表名稱為 `def_櫃位主檔_Master`，且欄位為 `[專櫃編號, 位置, 專櫃名稱, 專櫃狀態...]`，導致後端全數進入未找到主檔之預設 fallback，防呆機制未起作用。
- **根因分析**：
  專案存在歷史命名差異（正式表皆有 `def_` 前綴，如 `def_水電軌道燈紀錄_Log`、`def_櫃位主檔_Master`），且 Column A 的標題名稱為 `專櫃編號`（而非 `專櫃代碼`）。
- **解決方案**：
  1. 更新 `Code.js` 中的 `CONFIG.SHEET_MASTER` 優先讀取 `def_櫃位主檔_Master`。
  2. 重構 `checkCounterMasterStatus()` 函式，加入**智慧動態表頭對齊演算法**：動態尋找 `專櫃編號`/`專櫃代碼`、`專櫃名稱` 及 `專櫃狀態`/`撤櫃日期` 的 column index，確保不論欄位順序為何皆能 100% 精準對齊。
  3. 透過 `clasp push` 與 `clasp deploy` 正式完成 Web App 版本升級 (Deployed @7)。
- **狀態**：🟢 已解決 (Resolved)

