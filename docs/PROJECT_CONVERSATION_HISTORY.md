# 專案對話與決策歷程紀錄 (Project Conversation & Decision History)

## 📌 2026-09-22：專案啟動、全域治理規範導入與模型精準落地

### 1. 任務背景
- 啟動「專櫃水電抄表自動化系統（Counter Utility Meter App）」之開發。
- 使用者要求第一步：「依照 ARCHITECTURE.md 規劃，開始第一步：建立副本試算表暫存表與 AppSheet 串接」。
- 在正式動手建立表單前，要求先參考其他專案中應遵守之全域 Rule 及 Skill 載入至本專櫃專案中。

### 2. 重要決策與事件
1. **排查並修復全域 Hook 衝突**：
   - 發現本機全域外掛 `googlecloudtools.datacloud_telemetry` 因 Windows 路徑多重引號問題導致 Node.js crash，阻擋所有工具調用。
   - 指導使用者於 PowerShell 執行指令，將問題外掛移出 `plugins` 目錄，工具調用全面恢復正常。
2. **全域規範與踩坑鐵律導入**：
   - 參考全域規範與既有專案踩坑經驗。
   - 建立了 `.gitignore`（敏感金鑰與設定檔保護）。
   - 全面更新 `AGENTS.md`，納入「100% 繁體中文（台灣）」、「資料庫隔離與主表結構保護」、「四份標準日誌 SOP」、「Google Sheets 日期/批次抹除防護」與「儀表專業辨識防呆」。
   - 初始化標準文件架構：`PROGRESS.md`, `ISSUES_LOG.md`, `PROJECT_HANDOVER.md`, `docs/PROJECT_CONVERSATION_HISTORY.md`。
3. **自主動手實作：雲端後端自動化建置 (Clasp + GAS)**：
   - 透過 `@google/clasp`，自動將專案綁定至開發副本試算表。
   - 產出 Google Apps Script 微服務專案。
   - 編寫 `gas/Code.js`，包含：
     - `initQueueSheet()`：自動建立/格式化 `抄表待審核_Queue` 暫存表與 13 個標準欄位。
     - `onOpen()`：試算表自訂功能選單【⚡ 專櫃水電系統】。
     - `doGet()`：Web API 自動化觸發端點。
   - 自動完成代碼推送與雲端 Web 部署發布。
   - 使用者於試算表完成授權後，Web API 雙向驗證 200 OK 成功：
     - `抄表待審核_Queue` 13 欄位設定成功。
     - 成功探測計費主表 `水電軌道燈紀錄_Log` 16 個標準欄位，雙向對齊。
     - 階段 1 正式圓滿達成！
4. **模型架構升級與 AI 辨識引擎部署 (Gemini 最新 Flash 系列)**：
   - 遵照使用者指示，全面淘汰舊版 2.0 模型，優先採用性價比最高、多模態延遲極低的 **`gemini-3.8-flash`** / **`gemini-3.6-flash`**。
   - 於 `gas/Code.js` 完整實作三大儀表防呆（110V 紅框小數、220V 單位必須為 kWh、水表整數）、度數逆轉比對、自動寫入 `抄表待審核_Queue` 與合格一鍵過帳函式。
5. **歷史照片端到端實測與重大架構校正 (v3.0 貼紙優先架構)**：
   - **檢討與使用者重要指導**：
     - 使用者明確指出現場每顆表均有張貼制式貼紙（`| 專櫃編號 | 專櫃名稱 | 儀表類別 |`），不應從檔名亂猜，也不該限制一櫃一表。
     - 使用者指出 202608 期的真實數字已存在資料庫主表中，可作為地面真值（Ground Truth）比對。
   - **v3.0 貼紙優先演算法落實**：
     - Prompt 強化為兩段式：第一步精準定位並提取貼紙文字與類別代碼（110/220/水），第二步四捨五入提取度數並檢查 kWh 單位。
   - **真值對照 100% 精準驗證**：
     - **BAW (00066)**：照片大同電子表 06450.2 kWh ➔ AI 提取 6450 ➔ 主表 202608 本期度數恰為 **6450**（100% 吻合）。
     - **ISFN (00047)**：照片大同電子表 01891.3 kWh ➔ AI 提取 1891 ➔ 主表 202608 本期度數恰為 **1891**（100% 吻合）。
     - **胜之鑰 (00048)**：照片大同電子表 11853 kWh ➔ AI 提取 11853 ➔ 主表 202608 本期度數恰為 **11853**（100% 吻合）。
6. **月結滾動功能落實與異地開發資安清理 (v3.5 安全合規)**：
   - 依使用者指示，新增「📅 一鍵生成下期主表骨架 (月結滾動)」功能，自動將最新期數的本期度數無縫結轉為下期前期度數，並產生待抄表列。
   - 全面清理所有 Markdown 檔案中的真實試算表 ID、雲端硬碟資料夾 ID 與私密網址。
   - 建立 `.env.example` 與 `.clasp.json.example`，將資源設定移至私有指令碼屬性 (PropertiesService)，專案已 100% 符合異地開發與 GitHub 託管資安標準。
7. **AppSheet 前端優化與雙向串接落地 (v3.7 AppSheet 整合版)**：
   - 實作並部署支援 AppSheet Webhook 的 `doPost(e)` 介面，通過 200 OK 驗證。
   - 優化照片產生 URL 為 `uc?export=view&id=`，確保 AppSheet 圖片縮圖順暢載入。
   - 增加單筆記錄重新辨識端點 `processSingleQueueRecord`，提供卡片 Inline Action 即時重跑能力。
# 專案對話與決策歷程紀錄 (Project Conversation & Decision History)

## 📌 2026-09-22：專案啟動、全域治理規範導入與模型精準落地

### 1. 任務背景
- 啟動「專櫃水電抄表自動化系統（Counter Utility Meter App）」之開發。
- 使用者要求第一步：「依照 ARCHITECTURE.md 規劃，開始第一步：建立副本試算表暫存表與 AppSheet 串接」。
- 在正式動手建立表單前，要求先參考其他專案中應遵守之全域 Rule 及 Skill 載入至本專櫃專案中。

### 2. 重要決策與事件
1. **排查並修復全域 Hook 衝突**：
   - 發現本機全域外掛 `googlecloudtools.datacloud_telemetry` 因 Windows 路徑多重引號問題導致 Node.js crash，阻擋所有工具調用。
   - 指導使用者於 PowerShell 執行指令，將問題外掛移出 `plugins` 目錄，工具調用全面恢復正常。
2. **全域規範與踩坑鐵律導入**：
   - 參考全域規範與既有專案踩坑經驗。
   - 建立了 `.gitignore`（敏感金鑰與設定檔保護）。
   - 全面更新 `AGENTS.md`，納入「100% 繁體中文（台灣）」、「資料庫隔離與主表結構保護」、「四份標準日誌 SOP」、「Google Sheets 日期/批次抹除防護」與「儀表專業辨識防呆」。
   - 初始化標準文件架構：`PROGRESS.md`, `ISSUES_LOG.md`, `PROJECT_HANDOVER.md`, `docs/PROJECT_CONVERSATION_HISTORY.md`。
3. **自主動手實作：雲端後端自動化建置 (Clasp + GAS)**：
   - 透過 `@google/clasp`，自動將專案綁定至開發副本試算表。
   - 產出 Google Apps Script 微服務專案。
   - 編寫 `gas/Code.js`，包含：
     - `initQueueSheet()`：自動建立/格式化 `抄表待審核_Queue` 暫存表與 13 個標準欄位。
     - `onOpen()`：試算表自訂功能選單【⚡ 專櫃水電系統】。
     - `doGet()`：Web API 自動化觸發端點。
   - 自動完成代碼推送與雲端 Web 部署發布。
   - 使用者於試算表完成授權後，Web API 雙向驗證 200 OK 成功：
     - `抄表待審核_Queue` 13 欄位設定成功。
     - 成功探測計費主表 `水電軌道燈紀錄_Log` 16 個標準欄位，雙向對齊。
     - 階段 1 正式圓滿達成！
4. **模型架構升級與 AI 辨識引擎部署 (Gemini 最新 Flash 系列)**：
   - 遵照使用者指示，全面淘汰舊版 2.0 模型，優先採用性價比最高、多模態延遲極低的 **`gemini-3.8-flash`** / **`gemini-3.6-flash`**。
   - 於 `gas/Code.js` 完整實作三大儀表防呆（110V 紅框小數、220V 單位必須為 kWh、水表整數）、度數逆轉比對、自動寫入 `抄表待審核_Queue` 與合格一鍵過帳函式。
5. **歷史照片端到端實測與重大架構校正 (v3.0 貼紙優先架構)**：
   - **檢討與使用者重要指導**：
     - 使用者明確指出現場每顆表均有張貼制式貼紙（`| 專櫃編號 | 專櫃名稱 | 儀表類別 |`），不應從檔名亂猜，也不該限制一櫃一表。
     - 使用者指出 202608 期的真實數字已存在資料庫主表中，可作為地面真值（Ground Truth）比對。
   - **v3.0 貼紙優先演算法落實**：
     - Prompt 強化為兩段式：第一步精準定位並提取貼紙文字與類別代碼（110/220/水），第二步四捨五入提取度數並檢查 kWh 單位。
   - **真值對照 100% 精準驗證**：
     - **BAW (00066)**：照片大同電子表 06450.2 kWh ➔ AI 提取 6450 ➔ 主表 202608 本期度數恰為 **6450**（100% 吻合）。
     - **ISFN (00047)**：照片大同電子表 01891.3 kWh ➔ AI 提取 1891 ➔ 主表 202608 本期度數恰為 **1891**（100% 吻合）。
     - **胜之鑰 (00048)**：照片大同電子表 11853 kWh ➔ AI 提取 11853 ➔ 主表 202608 本期度數恰為 **11853**（100% 吻合）。
6. **月結滾動功能落實與異地開發資安清理 (v3.5 安全合規)**：
   - 依使用者指示，新增「📅 一鍵生成下期主表骨架 (月結滾動)」功能，自動將最新期數的本期度數無縫結轉為下期前期度數，並產生待抄表列。
   - 全面清理所有 Markdown 檔案中的真實試算表 ID、雲端硬碟資料夾 ID 與私密網址。
   - 建立 `.env.example` 與 `.clasp.json.example`，將資源設定移至私有指令碼屬性 (PropertiesService)，專案已 100% 符合異地開發與 GitHub 託管資安標準。
7. **AppSheet 前端優化與雙向串接落地 (v3.7 AppSheet 整合版)**：
   - 實作並部署支援 AppSheet Webhook 的 `doPost(e)` 介面，通過 200 OK 驗證。
   - 優化照片產生 URL 為 `uc?export=view&id=`，確保 AppSheet 圖片縮圖順暢載入。
   - 增加單筆記錄重新辨識端點 `processSingleQueueRecord`，提供卡片 Inline Action 即時重跑能力。
   - 撰寫完整落地指南 `docs/APPSHEET_SETUP_GUIDE.md`，涵蓋 Schema、Deck View、紅綠燈 Format Rules 及五大業務 Actions。
8. **AppSheet 手機端實機體驗、換機交接與 GitHub 推送 (v4.0 階段里程碑)**：
   - 成功引導使用者在 AppSheet 建立 `抄表待審核_Queue` 專屬 Deck View 卡片流。
   - 手機實機測試成功：專櫃名稱、儀表類別、度數清楚呈現，支援手動覆核修改並即時同步。
   - 發現手機端外部 URL 跳轉限制，規劃「AppSheet Automation Bot 背景 Webhook」原生無感架構。
   - 完成全面資安機敏檢查（零敏感 ID、零憑證外洩），整理換機交接手冊，準備推送至 GitHub。
9. **AppSheet Automation Bot 背景 Webhook 成功設定與驗收**：
   - 於 AppSheet 完成 Bot 流程配置 (Event: `抄表待審核_Queue` Adds ➔ Task: `Call a webhook` HTTP POST)。
   - 傳送標頭為 JSON，Body Payload 為 `{"action": "processPhotos", "limit": 5}`。
   - 成功實現手機現場拍照上傳時，在背景無感發送 Webhook 觸發 Gemini AI 辨識並更新卡片流，免跳出瀏覽器。
10. **專櫃主檔 (`櫃位主檔_Master`) 維護與已撤櫃/非主檔防呆落地**：
    - 擴充 `gas/Code.js` 支援 `櫃位主檔_Master` 結構（`專櫃代碼`, `專櫃名稱`, `專櫃狀態`, `撤櫃日期`, `備註`）與選單【🏢 初始化/檢查專櫃主檔】。
    - 實作 `checkCounterMasterStatus()` 防呆過濾機制：
      - 防呆一：照片貼紙專櫃非主檔專櫃 ➔ 跳過 OCR 度數辨識與用量計算，標註 `異常`（備註 `⚠️ [非主檔專櫃]`）。
      - 防呆二：專櫃已撤櫃（拍照日 >= 撤櫃日期） ➔ 跳過 OCR 度數辨識與用量計算，標註 `已撤櫃`（備註 `⚠️ [已撤櫃專櫃]`）。
    - 指導並更新 [`docs/APPSHEET_SETUP_GUIDE.md`](file:///c:/Github/ReactApp/counter-utility-meter-app/docs/APPSHEET_SETUP_GUIDE.md) 指南：替換原 `Statistics` 視圖為 `專櫃主檔` 維護視圖。
11. **縮圖預覽修復與前端雙動線分流**：
    - 排查 AppSheet 照片欄位呈現灰色 ⚠️ 驚嘆號問題，全面實作 `fixPhotosPermissionsAndUrls()`：
      - 三大照片資料夾與 Queue 表 19 筆照片權限一鍵開放為 `ANYONE_WITH_LINK`。
      - 網址升級為 Google 官方高畫質直連 CDN 格式：`https://lh3.googleusercontent.com/d/FILE_ID`，解決瀏覽器安全標頭攔截與縮圖快取問題。
    - 前端按鈕雙動線分流：
      - 【📷 批次拍照上傳】：綁定 Google Drive 待處理資料夾深層連結，支援在現場一次挑選多張儀表照片整批上傳。
      - 【➕ 單筆拍照補登】：保留 AppSheet 預設加號表單，供特殊單筆補登使用。
12. **自動識別三大去重防呆機制與歷史資料清洗實施 (v4.5 去重防呆版)**：
    - 解決使用者反饋「只要按自動識別 會跑出一樣的要求請你要核可 會重覆產生」之重大體驗問題：
      - **防呆一（照片 File ID 去重）**：比對已存在之照片 File ID，若已存在則安全移至歸檔資料夾並直接略過，不重複辨識、不耗費 Gemini 額度。
      - **防呆二（業務維度 In-place Upsert）**：針對相同專櫃、相同儀表類別且尚未過帳之卡片，直接就地覆蓋更新度數、照片、用量與備註，標記【更新覆蓋最新照片】，保證 AppSheet 畫面永遠只有一張最新卡片，徹底消除雙胞胎卡片。
      - **防呆三（移檔雙重保證）**：撰寫 `safeMoveFile()` 確保照片 100% 移出 `pendingFolder`，消除殘留與重複讀取。
      - **歷史髒資料清洗**：實作 `deduplicateQueueSheet()`，線上成功清除 5 筆重複卡片及 2 筆空行，暫存表完全淨化為 12 筆乾淨記錄！
