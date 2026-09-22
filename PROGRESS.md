# 系統開發進度與功能完成度對照表 (Progress & Roadmap)

最後更新時間：2026-09-22

---

## 📊 開發進度總覽

| 階段 | 任務目標 | 狀態 | 完成內容說明 |
| :--- | :--- | :---: | :--- |
| **階段 0** | **專案規範與環境整備** | 🟢 已完成 | 導入繁體中文全域 Rule、AGENTS.md、.gitignore、資安隔離與四大維護日誌 |
| **階段 1** | **副本試算表暫存表與 AppSheet 串接** | 🟢 已完成 | 建立綁定 GAS、完成 `抄表待審核_Queue` 13 欄位格式化、主表 16 欄位雙向校驗通過 |
| **階段 2** | **Google Drive 照片區與動線建立** | 🟢 已完成 | 待處理、已歸檔、異常複查三區資料夾連通，照片自動移檔動線驗證完畢 |
| **階段 3** | **Gemini 3.8 Flash AI 辨識 GAS 後端** | 🟢 已完成 | 採用最新 `gemini-3.8-flash` 模型，實作貼紙優先 OCR（SSOT），新增專櫃主檔與已撤櫃/非主檔專櫃過濾跳過辨識防呆 |
| **階段 3.5** | **月結滾動機制 (一鍵生成下期主表骨架)** | 🟢 已完成 | 實作 `initializeNextMonthLog()`，支援自動將最新期本期度數結轉為下期前期度數，並具備防空轉防呆 |
| **階段 4** | **一鍵過帳程序 (Queue -> 主表 Log)** | 🟢 已完成 | 實作 `postVerifiedReadingsToLog()`，合格度數回填至主表，並掛載試算表專屬快捷選單 |
| **階段 5** | **AppSheet 介面優化與 Webhook 雙向串接** | 🟢 已完成 | 支援 `doPost` Webhook、AppSheet Automation Bot 背景發送、專櫃主檔 Schema 設定、照片縮圖 URL 優化與單筆重新辨識 API |
| **階段 6** | **全流程整合測試與正式上線驗收** | 🟢 進行中 | 完成 AppSheet Bot 背景呼叫與專櫃主檔防呆升級，端到端拍照 ➔ AI 辨識 ➔ 滑動審核 ➔ 過帳測試進行中 |

---

## 📝 階段任務完成明細

### 階段 1：副本試算表與暫存表
- [x] 確定暫存表名稱與欄位定義 (`抄表待審核_Queue`)
- [x] 本地與雲端自動化管線打通（Clasp + GAS 綁定）
- [x] 撰寫暫存表初始化、表頭美化與選單掛載腳本 (`gas/Code.js`)
- [x] 雙向校驗主表 16 欄位結構（A: 結帳年月 ~ P: 水費單價）吻合
- [x] 確認 AppSheet 雙表權限隔離原則（暫存表讀寫，主表唯讀）

### 階段 2 & 3：Google Drive 與 Gemini 3.8 Flash 辨識核心
- [x] 連接待處理、已歸檔、異常複查三大雲端資料夾
- [x] 導入目前最新、省成本之 `gemini-3.8-flash` 多模態模型
- [x] 實作「制式貼紙優先（Sticker-First OCR）」演算法：定位 `| 專櫃編號 | 專櫃名稱 | 儀表類別 |` 作為第一真理
- [x] 歷史真值驗證通過：BAW (6450)、ISFN (1891)、胜之鑰 (11853) 全數 100% 正確匹配
- [x] 加入度數逆轉、黑屏、單位不符紅燈警示防呆機制
- [x] 加入 Google API 503 暫態重試機制（指數退避）

### 階段 3.5 & 4：月結滾動與過帳核心
- [x] 實作月結滾動功能 (`initializeNextMonthLog`)：自動結轉前期度數，本期留白
- [x] 加入月結防呆：若最新期尚未有過帳度數，禁止空轉生成下下期
- [x] 實作合格度數回填主表 (`postVerifiedReadingsToLog`)
- [x] 試算表頂部掛載【⚡ 專櫃水電系統】專屬工具選單
- [x] 全面資安清理：所有真實 ID、資料夾 ID、API Key 自 Markdown 與公開程式碼中清除，改由雲端 `ScriptProperties` 動態注入

### 階段 5：AppSheet 前端優化與雙向串接
- [x] 撰寫並發布支援 AppSheet Webhook 的 `doPost(e)` 接口，支援 POST JSON / UrlEncoded 呼叫
- [x] 優化照片預覽 URL 格式為 `https://drive.google.com/uc?export=view&id=`，確保 AppSheet 縮圖正常載入
- [x] 實作單筆記錄 AI 重新辨識端點 (`processSingleQueueRecord`)
- [x] 產出專屬前端配置指南 [`docs/APPSHEET_SETUP_GUIDE.md`](docs/APPSHEET_SETUP_GUIDE.md)（涵蓋欄位型別、公式、Deck View、紅綠燈 Format Rules 與 5 大 Actions）
