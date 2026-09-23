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
  1. 後端 `Code.js` 實作 `fixPhotosPermissionsAndUrls()`：自動將三大照片資料夾與 Queue 表中既有之所有照片設定為「知道連結的任何人皆可檢視 (`ANYONE_WITH_LINK`)」，並將網址一鍵升級為 Google 官方高畫質直連 CDN 格式：`https://lh3.googleusercontent.com/d/FILE_ID`（經 curl 檢驗直接回傳 200 `image/jpeg`）。
  2. 升級 `processPendingMeterPhotos()`：未來所有新處理之照片，在辨識時自動設定 `file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)`，確保後續上傳之照片 100% 正常預覽。
  3. 將 AppSheet 動作按鈕或自動化改為 **`Call a webhook`** 或 **AppSheet Automation Bot**，讓 HTTP 請求 100% 在背景發送，實現無感原生體驗。
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

---

### ISSUE-007: 自動識別重複產生待審核卡片與暫存表缺乏去重防呆
- **發生日期**：2026-09-23
- **嚴重等級**：High（影響審核流程與資料一致性）
- **錯誤現象**：
  使用者反饋：「只要按自動識別 會跑出一樣的要求請你要核可 會重覆產生」。在 AppSheet 介面中同一個專櫃（如「歐印」、「半山815夢工廠」）出現多筆重複的待核可卡片。
- **根因分析**：
  1. **無照片 File ID 去重**：辨識前未比對 Queue 表中已存在的照片 File ID，同一照片被重複迭代或多次觸發時無腦呼叫 Gemini 並重複 `appendRow`。
  2. **無業務維度 Upsert（同櫃同表覆蓋更新）**：當針對相同專櫃、相同儀表類別（如「半山815夢工廠」的「110V電表」）上傳新照片或重新辨識時，舊程式直接無條件 `appendRow`，未採用就地覆蓋更新。
  3. **Drive 移檔保證機制**：檔案搬移至封存資料夾時，若因引用關係未徹底脫離 `pendingFolder`，下一次迴圈可能再次撈到。
  4. **歷史髒資料殘留**：暫存表中累積了歷史重複列與空行。
- **解決方案**：
  1. 實作**照片等級去重**：辨識前比對 Queue 表所有照片 File ID，若已存在則安全歸檔並略過。
  2. 實作**業務維度 In-place Upsert**：辨識出專櫃代碼/名稱與儀表類別後，若暫存表中已有相同專櫃+儀表類別之未過帳列，直接**就地覆蓋更新 (In-place Update)** 該列的資料與照片網址，備註標註 `【更新覆蓋最新照片】`，絕不新增新列。
  3. 實作 `safeMoveFile()`：雙重保證移出來源資料夾，清空 `pendingFolder`。
  4. 實作 `deduplicateQueueSheet()` 去重清理函式，並提供試算表選單與 API 端點 `?action=dedupQueue`，實機執行一次性成功清理 5 筆重複卡片及 2 筆空行，暫存表恢復 12 筆乾淨唯一紀錄。
- **狀態**：🟢 已解決 (Resolved)

---

### ISSUE-008: 批次上傳網頁出現 Unexpected token '<', "<!doctype "... is not valid JSON 異常
- **發生日期**：2026-09-23
- **嚴重等級**：High（阻斷一站式批次上傳與 AI 辨識頁面執行）
- **錯誤現象**：
  在 RWD 批次上傳網頁中，選取多張照片並點擊【🚀 開始批次上傳與 AI 辨識】後，進度條跑到底出現紅色警示：
  `⚠️ 辨識過程中遇到提示：Unexpected token '<', "<!doctype "... is not valid JSON`。
- **根因分析**：
  1. Google Apps Script 的 HtmlService 在前端是運行在 `googleusercontent.com` 的 iframe 沙盒內部。
  2. 原前端代碼使用 `fetch(window.location.href, { method: 'POST', body: ... })` 試圖呼叫自身，但目標 URL 並非合法的 GAS Web App 端點，被 Google 伺服器拒絕並回傳包含 `<!doctype html...>` 的錯誤網頁（或經歷 302 重導向與 CORS 預檢失敗）。
  3. 前端以 `await res.json()` 解析該 HTML 錯誤頁面時，JSON 解析器在第一個字元遇到 `<` 即拋出語法解析錯誤。
- **解決方案**：
  1. **遷移至 GAS 原生通訊機制**：捨棄不可靠的 `fetch()`，全面導入 Google Apps Script 官方專屬的 `google.script.run` RPC 通訊。
  2. 在後端 `Code.js` 定義獨立 RPC 函式 `saveUploadedPhoto(fileName, mimeType, base64Data)`，負責接收前端 Canvas 壓縮後的 Base64 輕量圖片並寫入待處理資料夾。
  3. 前端封裝 `callGasServer(funcName, ...args)` Promise 函式：
     - 階段一：逐一壓縮並呼叫 `callGasServer('saveUploadedPhoto', ...)`。
     - 階段二：呼叫 `callGasServer('processPendingMeterPhotos', count)` 直接獲得原生 JavaScript 物件。
  4. 徹底消除 HTTP/POST/CORS/302 重導向與 iframe 網址偏移問題，傳輸穩定極速，成果卡片流暢渲染。
  5. 透過 `clasp push` 與 `clasp deploy` 正式部署至版本 `@24`。
- **狀態**：🟢 已解決 (Resolved)

---

### ISSUE-009: 一鍵過帳因循序搜尋未指定最新期，導致度數誤寫入歷史期別 (202607)
- **發生日期**：2026-09-23
- **嚴重等級**：Critical（直接影響主表財務度數過帳正確性）
- **錯誤現象**：
  使用者在 AppSheet 完成核準並點擊一鍵確認後，回報「剛辨識出來迷你米特 我也按了一鍵OK 處理完成 但沒有寫回資料庫中」。
  檢查暫存表發現迷你米特已移出，但主表 `202609` 當期的 110V 本期度數仍為空白。
- **根因分析**：
  1. 主表 `def_水電軌道燈紀錄_Log` 為時間序列長表，按期別滾動累積（包含 `202607`, `202608`, `202609` 等）。
  2. 原 `postVerifiedReadingsToLog()` 迴圈比對專櫃代碼時，採 `for (let j = 0; j < logData.length; j++)` 由第 0 筆循序往下找。
  3. 比對到第一個出現的「00094 迷你米特」時（恰為歷史期別 `202607`），便立即將度數 1435 寫入該列並 `break`，導致當前最新期 `202609` 完全沒被寫入，且歷史期別度數遭到覆蓋篡改。
- **解決方案**：
  1. **導入最新期動態鎖定防呆**：
     - 在過帳前動態取得主表最新年月（`latestYm`，如 `202609`）。
     - 比對專櫃時強制限制 `if (latestYm && ym !== latestYm) continue;`，並由後往前搜尋，保證 100% 只寫入最新期，歷史期別絕對安全。
  2. **實作資料修復程序 (`fixMiniMeterHistoryData`)**：
     - 將 `202607` 迷你米特 110V 本期度數還原為歷史真值 `1419`，抄表日還原為 `2026/7/31`。
     - 將 `202609` 迷你米特 110V 本期度數正確填入 `1435`，抄表日設定為今日 `2026/9/23`。
  3. 透過微服務端點實機執行校正，三期數據（1419 / 1430 / 1435）連續性驗證 100% 吻合！
  4. 部署至正式版本 `@26`。
- **狀態**：🟢 已解決 (Resolved)


