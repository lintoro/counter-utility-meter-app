# 專案交接與換機維運手冊 (Project Handover & Operations Guide)

本手冊供換機開發、後續維護同仁或接手之 AI Agent 快速接軌專案，涵蓋架構全貌、環境配置、安全鐵律與接續開發指引。

---

## 📌 一、 專案核心資訊與最新開發成果 (2026-09-23 最新狀態)

- **專案名稱**：Counter Utility Meter App (專櫃水電抄表自動化系統)
- **GitHub 倉庫**：`https://github.com/lintoro/counter-utility-meter-app`
- **系統最新版本**：**v4.1 專櫃主檔與撤櫃防呆正式部署版 (Deployed @7)**
- **核心架構與功能亮點**：
  - **雙表解耦**：`抄表待審核_Queue`（操作暫存表） ↔ `水電軌道燈紀錄_Log`（財務計費主表 SSOT，唯讀保護）。
  - **專櫃主檔智慧對齊 (`def_櫃位主檔_Master`)**：
    - 後端自動探測並相容 `def_櫃位主檔_Master` 頁籤。
    - 智慧定位 `專櫃編號` (Col A)、`專櫃名稱` (Col C) 與 `專櫃狀態` (Col D)，無需更動原始欄位。
  - **雙重防呆過濾（已撤櫃 / 非主檔跳過辨識）**：
    - **非主檔專櫃防呆**：照片專櫃未在 `def_櫃位主檔_Master` 中 ➔ **直接結束，跳過度數辨識**，標註 `異常` (`⚠️ [非主檔專櫃]`)。
    - **已撤櫃專櫃防呆**：專櫃於 `def_櫃位主檔_Master` 狀態為 `已撤櫃` 或已過撤櫃日 ➔ **直接結束，跳過度數辨識**，標註 `已撤櫃` (`⚠️ [已撤櫃專櫃]`)。
  - **AppSheet Automation Bot 背景 Webhook**：
    - 成功建立並部署 AppSheet Bot (Adds ➔ POST JSON `{"action": "processPhotos", "limit": 5}`)。
    - 巡檢員現場拍照上傳時，於背景無感發送 Webhook 觸發辨識並刷新卡片流，**完全不跳出瀏覽器**。
  - **照片高畫質 CDN 縮圖網址**：
    - 升級圖片產出格式為 Google 官方 CDN `https://lh3.googleusercontent.com/d/FILE_ID`，解決 AppSheet 驚嘆號 ⚠️ 無法載入與圖片放大問題。

---

## 🛑 二、 本日開發斷點與接續手動測試工作 (Next Steps for Next Session)

> **當前開發斷點 (2026-09-23 00:50)**：
> **後端程式碼與雲端 Web App 微服務部署已 100% 推送生效 (Deployed @7)**。
> 目前開發進度正處於 **「待同仁手動測試驗證 (Pending Manual Test)」** 階段。

### 下一次開工 / 接手第一優先事項：

1. **實機照片手動測試與驗收 (Manual Test Verification)**：
   - 準備或上傳 3 種情境之儀表照片至 Google Drive「待處理照片區」：
     - **測試 A（正常營業專櫃）**：在上櫃清單內之專櫃照片 ➔ 驗證是否正常辨識貼紙、度數並計算本期用量。
     - **測試 B（已撤櫃專櫃）**：於 `def_櫃位主檔_Master` 將某專櫃狀態改為 `已撤櫃` 或填入歷史撤櫃日期，拍攝該專櫃照片 ➔ 驗證是否自動標註 `已撤櫃` 且**度數留空、跳過辨識**。
     - **測試 C（非主檔專櫃）**：拍攝不存在於 `def_櫃位主檔_Master` 中之專櫃照片 ➔ 驗證是否自動標註 `異常` (非主檔專櫃) 且**度數留空、跳過辨識**。

2. **AppSheet `Statistics` 視圖整理與 `def_櫃位主檔_Master` 介面維護**：
   - **方案 1 (推薦)**：在 AppSheet 載入 `def_櫃位主檔_Master` 資料表，將原本的 `Statistics` 圖表視圖修改名稱為 `專櫃主檔` (Table View)，作為管理員維護撤櫃日期的專屬畫面。
   - **方案 2**：若無需圖表，直接於 AppSheet 的 **UX > Views** 中點選 `Statistics` 並點擊刪除 🗑️。

---

## 💻 三、 換機開發環境配置指南 (New Machine Setup)

當您在另一台電腦取得專案時，請依以下步驟快速就緒：

### 1. 複製專案庫
```bash
git clone https://github.com/lintoro/counter-utility-meter-app.git
cd counter-utility-meter-app
```

### 2. 還原設定檔範本
專案已內建安全範本，依資安規範真實設定檔不入 Git：
- `.clasp.json` 已自動建立並關聯至雲端腳本（`1_lt9B_comcSvTPEX1GhAwpUABJJd-ot4Ru6Ryb9L2UdREUA2cj3GWGbP`）。
- 複製 `.env.example` 為 `.env`。

### 3. Google 帳號與 Clasp 授權
```bash
npm install -g @google/clasp
clasp login
```
登入具有試算表編輯權限之 Google 帳號即可與雲端雙向同步 (`clasp pull` / `clasp push` / `clasp deploy`)。

---

## 🔒 四、 專案核心資安與開發守則

1. **強制繁體中文（台灣）**：所有對話、註解、文件一律使用繁體中文。
2. **資料庫絕對隔離**：僅能操作指定的開發副本試算表，嚴禁碰觸正式試算表。
3. **主表結構保護**：計費主檔 `水電軌道燈紀錄_Log` 與 `def_櫃位主檔_Master` 嚴禁任意抹除欄位，度數回填僅透過過帳程序執行。
4. **機敏零洩漏**：`.gitignore` 嚴密防護，任何 API Key、私密 ID 絕不提交至 GitHub。
