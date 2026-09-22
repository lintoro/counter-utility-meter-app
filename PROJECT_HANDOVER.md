# 專案交接與換機維運手冊 (Project Handover & Operations Guide)

本手冊供換機開發、後續維護同仁或接手之 AI Agent 快速接軌專案，涵蓋架構全貌、環境配置、安全鐵律與接續開發指引。

---

## 📌 一、 專案核心資訊與目前成果

- **專案名稱**：Counter Utility Meter App (專櫃水電抄表自動化系統)
- **GitHub 倉庫**：`https://github.com/lintoro/counter-utility-meter-app`
- **架構特點**：
  - **雙表解耦**：`抄表待審核_Queue`（操作暫存表） ↔ `水電軌道燈紀錄_Log`（財務計費主表 SSOT，唯讀保護）。
  - **貼紙優先 OCR (SSOT)**：優先辨識表具制式貼紙（`| 專櫃代碼 | 專櫃名稱 | 儀表類別 |`），比對 202608 歷史真值 100% 精準吻合。
  - **多模態 AI 辨識**：採用最新 `gemini-3.8-flash` / `gemini-3.6-flash`，具備 API 頻率保護與多模型降級容錯。
  - **月結滾動機制**：一鍵從最新期本期度數無縫結轉為下期前期度數，並具備防空轉防呆。
  - **AppSheet 手機端**：Deck View 卡片流已成功在手機實機運作，支援查看專櫃名稱、儀表類別、度數與手動覆核修改。

---

## 🛑 二、 本次交接斷點與接手工作 (Next Immediate Step)

> **當前開發斷點**：
> 已在 AppSheet 完成 `待審核清單` Deck View，正進入 **「Automation > Bots（自動化機器人）」** 設定，目標為打造 **「手機點擊按鈕時，在背景默默呼叫 Webhook，手機完全不跳出瀏覽器」** 的原生體驗。

### 換機後接手第一件事：
1. 打開 AppSheet 編輯畫面，點擊左側第 5 個小圖示 **【Automation 🤖】**。
2. 進入剛才建立的 **`New Bot`**：
   - **EVENT**：`抄表待審核_Queue` 資料異動。
   - **PROCESS > Custom task**：選擇 **`Call a webhook`**。
   - **Webhook URL**：填入 GAS 部署之 Web App URL。
   - **HTTP Verb**：`POST`
   - **Body Template**：
     ```json
     {
       "action": "processPhotos",
       "limit": 5
     }
     ```
3. 存檔後，巡檢員在手機點擊按鈕，即可在背景完全不跳出網頁的情況下，完成 AI 辨識並自動更新卡片！

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
- 複製 `.clasp.json.example` 為 `.clasp.json`，填入您的 `scriptId`。
- 複製 `.env.example` 為 `.env`。

### 3. Google 帳號與 Clasp 授權
```bash
npm install -g @google/clasp
clasp login
```
登入具有試算表編輯權限之 Google 帳號即可與雲端雙向同步 (`clasp pull` / `clasp push`)。

### 4. 雲端變數說明 (無痛換機)
所有敏感資源 ID（試算表 ID、三大照片資料夾 ID、Gemini API Key）均已保存在 Google Apps Script 的雲端私有 **`ScriptProperties`（指令碼屬性）** 中。換機後**無需手動重新配置雲端變數**，後端代碼透過 `PropertiesService` 自動讀取！

---

## 🔒 四、 專案核心資安與開發守則

1. **強制繁體中文（台灣）**：所有對話、註解、文件一律使用繁體中文。
2. **資料庫絕對隔離**：僅能操作指定的開發副本試算表，嚴禁碰觸正式試算表。
3. **主表結構保護**：計費主檔 `水電軌道燈紀錄_Log` 嚴禁增刪欄位與公式，度數回填僅透過審核過帳程序執行。
4. **機敏零洩漏**：`.gitignore` 嚴密防護，任何 API Key、私密 ID 絕不提交至 GitHub。
