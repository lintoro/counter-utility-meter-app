# 專案專屬規範 (Counter Utility Meter App Rules)

1. **語言原則**：所有互動、說明、文件、Commit 與程式碼註解必須 100% 使用「繁體中文（台灣）」，嚴禁簡體中文。
2. **資料庫隔離**：本專案僅限存取指定的副本試算表（由環境屬性 SPREADSHEET_ID 指定），嚴禁修改或碰觸正式試算表。
3. **主表結構保護**：計費主檔 `def_水電軌道燈紀錄_Log` 嚴禁增刪欄位或變更公式，只能由過帳程序更新度數與本期抄表日。
4. **雙表解耦**：AppSheet 一律寫入 `抄表待審核_Queue` 暫存表，主表設定為唯讀。
5. **四大維護日誌**：歷次重大變更必須同步維護 `docs/PROJECT_CONVERSATION_HISTORY.md`、`PROGRESS.md`、`ISSUES_LOG.md` 與 `PROJECT_HANDOVER.md`。
