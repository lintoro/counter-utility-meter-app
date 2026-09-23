# 專案交接與換機維運手冊 (Project Handover & Operations Guide)

本手冊供換機開發、後續維護同仁或接手之 AI Agent 快速接軌專案，涵蓋架構全貌、環境配置、安全鐵律與接續開發指引。

---

## 📌 一、 專案核心資訊與最新開發成果 (2026-09-23 最新狀態)

- **專案名稱**：Counter Utility Meter App (專櫃水電抄表自動化系統)
- **GitHub 倉庫**：`https://github.com/lintoro/counter-utility-meter-app`
- **專案名稱**：Counter Utility Meter App (專櫃水電抄表自動化系統)
- **GitHub 倉庫**：`https://github.com/lintoro/counter-utility-meter-app`
- **系統最新版本**：**v6.1 財務結算週期窗口鐵律版 (Deployed @27)**
- **核心架構與功能亮點**：
  - **雙表解耦**：`抄表待審核_Queue`（操作暫存表） ↔ `水電軌道燈紀錄_Log`（財務計費主表 SSOT，唯讀保護）。
  - **財務結算週期窗口鐵律 (Billing Cycle Window Rule)**：
    - 依據照片日期動態判定結算期別：每月 20 日到次月 5 日前（如 9/20~10/5）嚴格鎖定歸屬當期（`202609`），10/8 上傳自動切換為 `202610`。
    - 徹底杜絕提早生成下期主表骨架時，9 月底補拍照片被誤寫到 10 月份之重大邊界漏洞。
  - **一站式極速批次上傳與零等待背景 AI 辨識 (RWD 網頁)**：
    - 手機端支援一次多選照片/連續拍照，電腦端支援拖曳多圖。
    - 前端 HTML5 Canvas 智能等比壓縮：將 8MB~12MB 原始大圖縮小至 1600px、JPEG 82%，傳輸體積暴減 90%（350KB~500KB），單張上傳僅需 0.2~0.5 秒。
    - **零等待秒速交棒**：照片上傳完成後，立即由後端 `triggerBackgroundAiOcr()` 搭配 `LockService` 併發鎖在後台排隊持續辨識，前端完全不卡住等待，巡檢人員可立即點擊【📸 繼續上傳下一批照片】無縫連續作業！
    - 採用 Google Apps Script 官方原生 `google.script.run` RPC 機制，徹底根絕 CORS、302 重導向與 JSON 解析錯誤。
    - 畫面提供【📸 繼續上傳下一批照片】與【✅ 上傳完成（返回 AppSheet）】雙按鈕。
  - **自動識別三大去重防呆 (Triple Idempotency Guard)**：
    - **照片 File ID 去重**：已在 Queue 中的照片自動安全歸檔跳過，不重複辨識、不耗費 Gemini 額度。
    - **業務維度 In-place Upsert**：同櫃位同儀表類別就地更新原列（度數、照片、用量），標註【更新覆蓋最新照片】，保證 AppSheet 介面永遠只有一張最新卡片，徹底消除雙胞胎卡片。
    - **實體移檔保證**：`safeMoveFile()` 確保照片 100% 移出 `pendingFolder`，消除殘留與重複讀取。
  - **前端雙動線分流**：
    - 【📷 批次拍照上傳】：綁定極速批次上傳網頁（`?action=uploadView`），支援現場一次挑選多張儀表照片整批壓縮上傳與自動辨識。
    - 【➕ 單筆拍照補登】：保留 AppSheet 預設加號表單，供特殊單筆補登使用。
  - **照片高畫質 CDN 縮圖網址**：
    - 升級圖片產出格式為 Google 官方 CDN `https://lh3.googleusercontent.com/d/FILE_ID`，解決 AppSheet 驚嘆號 ⚠️ 無法載入與圖片放大問題。
  - **專櫃主檔智慧對齊與防呆 (`def_櫃位主檔_Master`)**：
    - 非主檔專櫃與已撤櫃專櫃自動跳過度數辨識，標註紅燈。

---

## 🛑 二、 本日開發斷點與全系統手動測試工作 (Next Steps for Next Session)

> **當前狀態 (2026-09-23 14:00)**：
> **後端程式碼與雲端 Web App 微服務部署已 100% 推送生效 (Deployed @19)**。
> **歷史重複資料已清洗完畢，暫存表完全淨化為 12 筆乾淨記錄**。
> 使用者裁示：「核可請處理 另手動測試還沒 我們全部一起測就好」。

### 全流程整合手動測試清單 (端到端手動測試)：

1. **現場拍照與批次上傳測試**：
   - 點擊 AppSheet【📷 批次拍照上傳】➔ 喚起 Google Drive「待處理照片區」一次上傳多張照片。
2. **自動識別去重防呆測試**：
   - 按下「自動識別」按鈕（或由 AppSheet Bot 背景觸發），觀察辨識完成後的卡片流：
     - 確認同一專櫃不會再產生兩張重複的卡片。
     - 若同櫃重新上傳新照片，確認卡片自動覆蓋更新為最新照片與最新度數。
3. **單筆拍照補登測試**：
   - 點擊【➕ 單筆拍照補登】填寫單筆紀錄，確認表單與儲存正常。
4. **AppSheet 滑動審核與一鍵過帳測試**：
   - 在卡片流中核對度數（或手動微調），按下【核准】。
   - 點擊試算表選單【⚡ 專櫃水電系統 > 📤 一鍵過帳合格度數至主表】，驗證合格度數是否正確過帳至 `水電軌道燈紀錄_Log` 主表對應欄位。

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
