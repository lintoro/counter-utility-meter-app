/**
 * 專櫃水電抄表自動化系統 (Counter Utility Meter App)
 * Google Apps Script 雲端微服務與試算表自動化核心 (v3.5 乾淨安全版)
 * 
 * 遵守規範：
 * 1. 雙表解耦架構：前線操作寫入「抄表待審核_Queue」，保護計費主檔「水電軌道燈紀錄_Log」
 * 2. 貼紙優先鐵律：優先定位表具制式貼紙（『| 專櫃編號 | 專櫃名稱 | 儀表類別 |』），以貼紙資訊為最高 SSOT
 * 3. 資安零外洩鐵律：敏感雲端資源 ID、API 金鑰一律透過 PropertiesService 動態讀取，絕不硬編碼於程式碼中
 * 4. 月結滾動機制：每期抄表前支援自動/一鍵生成下期主表骨架，將上期本期度數無縫結轉為下期前期度數
 * 5. 模型選用鐵律：採用最新 gemini-3.8-flash 模型，具備最高效能與成本節省
 * 6. 繁體中文（台灣）為唯一官方語言
 */

const CONFIG = {
  SHEET_LOG: '水電軌道燈紀錄_Log',
  SHEET_LOG_ALT: 'def_水電軌道燈紀錄_Log',
  SHEET_QUEUE: '抄表待審核_Queue',
  SHEET_MASTER: 'def_櫃位主檔_Master',
  SHEET_MASTER_ALT: '櫃位主檔_Master',
  GEMINI_MODELS: [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ],
  QUEUE_HEADERS: [
    'ID',
    '上傳時間',
    '照片',
    '專櫃代碼',
    '專櫃名稱',
    '儀表類別',
    '前期度數',
    'AI辨識度數',
    '人工覆核度數',
    '本期用量',
    '審核狀態',
    '審核備註',
    '抄表員'
  ],
  MASTER_HEADERS: [
    '專櫃代碼',
    '專櫃名稱',
    '專櫃狀態',
    '撤櫃日期',
    '備註'
  ]
};

/**
 * 安全動態取得本專案試算表物件
 * 容器綁定專案直接取得 ActiveSpreadsheet，免寫死 ID
 */
function getAppSpreadsheet() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}
  const sid = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (sid) return SpreadsheetApp.openById(sid);
  throw new Error('未設定試算表 ID，請在指令碼屬性中設定 SPREADSHEET_ID 或於容器中直接執行！');
}

/**
 * 安全動態取得雲端資料夾物件
 */
function getAppFolder(folderType) {
  const propKey = 'FOLDER_' + String(folderType).toUpperCase() + '_ID';
  const fid = PropertiesService.getScriptProperties().getProperty(propKey);
  if (!fid) {
    throw new Error('未設定資料夾屬性：' + propKey + '，請於指令碼屬性中設定！');
  }
  return DriveApp.getFolderById(fid);
}

/**
 * 試算表開啟時自動掛載專櫃水電抄表系統工具選單
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚡ 專櫃水電系統')
    .addItem('📅 一鍵生成下期主表骨架 (月結滾動)', 'menuInitNextMonth')
    .addSeparator()
    .addItem('🏢 初始化/檢查專櫃主檔 (Master)', 'menuInitMasterSheet')
    .addItem('🛠️ 初始化/檢查暫存表 (Queue)', 'menuInitQueueSheet')
    .addItem('🧹 清空暫存表 (保留表頭)', 'menuClearQueue')
    .addItem('🔍 檢測試算表結構健康狀態', 'menuCheckStatus')
    .addItem('🖼️ 一鍵修復照片存取權限與縮圖網址', 'menuFixPhotos')
    .addItem('🛡️ 一鍵清理暫存表重複卡片 (去重防呆)', 'menuDedupQueue')
    .addSeparator()
    .addItem('🤖 啟動 AI 影像辨識 (批次處理待處理照片)', 'menuTriggerAiOcr')
    .addItem('📤 一鍵過帳合格度數至主表', 'menuPostVerifiedToLog')
    .addToUi();
}

function menuDedupQueue() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = deduplicateQueueSheet();
    ui.alert('去重清理完成', res.message, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('清理失敗', '錯誤訊息：' + err.message, ui.ButtonSet.OK);
  }
}

function menuFixPhotos() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = fixPhotosPermissionsAndUrls();
    ui.alert('照片修復完成', res.message, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('修復失敗', '錯誤訊息：' + err.message, ui.ButtonSet.OK);
  }
}

function menuInitMasterSheet() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = initMasterSheet();
    ui.alert('專櫃主檔初始化', res.message, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('初始化失敗', '錯誤訊息：' + err.message, ui.ButtonSet.OK);
  }
}

/**
 * 建立或初始化「櫃位主檔_Master」工作表
 */
function initMasterSheet() {
  const ss = getAppSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_MASTER);
  let isCreated = false;

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_MASTER);
    isCreated = true;
  }

  const expectedHeaders = CONFIG.MASTER_HEADERS;
  sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);

  const headerRange = sheet.getRange(1, 1, 1, expectedHeaders.length);
  headerRange
    .setBackground('#0f172a')
    .setFontColor('#f8fafc')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);

  const colWidths = {
    1: 120, // 專櫃代碼
    2: 180, // 專櫃名稱
    3: 120, // 專櫃狀態
    4: 140, // 撤櫃日期
    5: 220  // 備註
  };

  Object.keys(colWidths).forEach(function(colIndex) {
    sheet.setColumnWidth(Number(colIndex), colWidths[colIndex]);
  });

  return {
    success: true,
    created: isCreated,
    sheetName: CONFIG.SHEET_MASTER,
    headers: expectedHeaders,
    message: isCreated
      ? '成功新建「' + CONFIG.SHEET_MASTER + '」工作表，包含 5 項標準欄位！'
      : '專櫃主檔「' + CONFIG.SHEET_MASTER + '」已存在，已完成格式化與表頭維護！'
  };
}

function menuInitNextMonth() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = initializeNextMonthLog();
    ui.alert('月結骨架生成', res.message, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('生成失敗', '錯誤訊息：' + err.message, ui.ButtonSet.OK);
  }
}

function menuInitQueueSheet() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = initQueueSheet();
    ui.alert('執行成功', res.message, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('執行失敗', '錯誤訊息：' + err.message, ui.ButtonSet.OK);
  }
}

function menuClearQueue() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = clearQueueSheet();
    ui.alert('清除完成', res.message, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('清除失敗', '錯誤訊息：' + err.message, ui.ButtonSet.OK);
  }
}

function menuCheckStatus() {
  const ui = SpreadsheetApp.getUi();
  try {
    const status = getSpreadsheetStatus();
    let msg = '試算表名稱：' + status.title + '\n\n工作表清單：\n';
    status.sheets.forEach(function(s) {
      msg += '• ' + s.name + ' (' + s.rows + ' 列 x ' + s.cols + ' 欄)\n';
    });
    ui.alert('健康狀態檢測', msg, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('檢測失敗', '錯誤訊息：' + err.message, ui.ButtonSet.OK);
  }
}

function menuTriggerAiOcr() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = processPendingMeterPhotos(5);
    ui.alert('AI 辨識完成', '已處理 ' + res.processedCount + ' 張照片！\n' + JSON.stringify(res.results, null, 2), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('AI 辨識失敗', '錯誤訊息：' + err.message, ui.ButtonSet.OK);
  }
}

function menuPostVerifiedToLog() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = postVerifiedReadingsToLog();
    ui.alert('過帳作業完成', res.message, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('過帳失敗', '錯誤訊息：' + err.message, ui.ButtonSet.OK);
  }
}

/**
 * 計算下一個結帳年月 (YYYYMM)
 */
function getNextYearMonth(ymStr) {
  const s = String(ymStr).trim();
  if (s.length !== 6) return '';
  const y = parseInt(s.slice(0, 4), 10);
  const m = parseInt(s.slice(4, 6), 10);
  if (m === 12) {
    return (y + 1) + '01';
  } else {
    const nextM = m + 1;
    return y + (nextM < 10 ? '0' + nextM : String(nextM));
  }
}

/**
 * 一鍵生成下期抄表主表骨架 (月結滾動 / Roll-Forward)
 * 自動將最新一期的本期度數轉為下一期的前期度數，並產生新的待抄表記錄
 */
function initializeNextMonthLog() {
  const ss = getAppSpreadsheet();
  const logSheet = ss.getSheetByName(CONFIG.SHEET_LOG) || ss.getSheetByName(CONFIG.SHEET_LOG_ALT);
  if (!logSheet) throw new Error('主表不存在');

  const lastRow = logSheet.getLastRow();
  if (lastRow <= 1) throw new Error('主表無任何歷史資料');

  const data = logSheet.getRange(2, 1, lastRow - 1, 16).getValues();

  // 1. 找出目前主表中最新的期數 (例如 202609)
  let latestYm = '';
  for (let i = 0; i < data.length; i++) {
    const ym = String(data[i][0]).trim();
    if (ym && ym > latestYm) {
      latestYm = ym;
    }
  }

  if (!latestYm) throw new Error('無法判定主表最新期數');

  // 2. 計算目標下一期年月
  const targetYm = getNextYearMonth(latestYm);
  if (!targetYm) throw new Error('計算下一期年月失敗 (當前: ' + latestYm + ')');

  // 3. 檢查是否已經存在該期數 (防呆防止重複生成)
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === targetYm) {
      return {
        success: false,
        message: '下期 [' + targetYm + '] 骨架已存在於主表中，不需重複生成！'
      };
    }
  }

  // 4. 防呆檢查：若最新一期尚未有任何本期度數過帳，禁止空轉生成下下期
  const latestRows = data.filter(function(r) { return String(r[0]).trim() === latestYm; });
  let hasAnyCurrReading = false;
  for (let i = 0; i < latestRows.length; i++) {
    if (latestRows[i][6] !== '' || latestRows[i][8] !== '' || latestRows[i][10] !== '') {
      hasAnyCurrReading = true;
      break;
    }
  }
  if (!hasAnyCurrReading) {
    return {
      success: false,
      message: '最新期 [' + latestYm + '] 目前尚無任何本期抄表度數（尚未完成當期過帳），為防止空轉已暫停生成！'
    };
  }

  // 5. 篩選出最新一期的所有專櫃資料列，滾動生成下期列
  const newRows = [];

  for (let i = 0; i < latestRows.length; i++) {
    const r = latestRows[i];
    const counterCode = r[1];
    const counterName = r[2];
    
    // 前期抄表日 = 上期本期抄表日 (若無則帶上期前期)
    const prevDate = r[4] || r[3] || '';
    const currDate = ''; // 本期留白等待填報

    // 220V: 前期度數 = 上期本期度數 (若無則繼承上期前期度數)
    const e220Prev = r[6] !== '' ? r[6] : r[5];
    const e220Curr = '';

    // 110V: 前期度數 = 上期本期度數 (若無則繼承上期前期度數)
    const e110Prev = r[8] !== '' ? r[8] : r[7];
    const e110Curr = '';

    // 水費: 前期度數 = 上期本期度數 (若無則繼承上期前期度數)
    const waterPrev = r[10] !== '' ? r[10] : r[9];
    const waterCurr = '';

    // 營業參數與單價原樣複製帶入
    const hours = r[11];
    const days = r[12];
    const extHours = r[13];
    const elecPrice = r[14];
    const waterPrice = r[15];

    newRows.push([
      targetYm,
      counterCode,
      counterName,
      prevDate,
      currDate,
      e220Prev,
      e220Curr,
      e110Prev,
      e110Curr,
      waterPrev,
      waterCurr,
      hours,
      days,
      extHours,
      elecPrice,
      waterPrice
    ]);
  }

  if (newRows.length === 0) {
    throw new Error('未找到最新期 [' + latestYm + '] 的專櫃資料');
  }

  // 寫入主表末端
  logSheet.getRange(lastRow + 1, 1, newRows.length, 16).setValues(newRows);

  return {
    success: true,
    latestYm: latestYm,
    newYm: targetYm,
    rowCount: newRows.length,
    message: '成功從 [' + latestYm + '] 滾動生成下期 [' + targetYm + '] 骨架共 ' + newRows.length + ' 櫃！'
  };
}

/**
 * 刪除主表中特定年月的資料列（謹慎使用）
 */
function removeLogYearMonth(targetYm) {
  if (!targetYm) throw new Error('必須指定要刪除的結帳年月');
  const ss = getAppSpreadsheet();
  const logSheet = ss.getSheetByName(CONFIG.SHEET_LOG) || ss.getSheetByName(CONFIG.SHEET_LOG_ALT);
  if (!logSheet) throw new Error('主表不存在');

  const lastRow = logSheet.getLastRow();
  if (lastRow <= 1) return { success: true, count: 0, message: '主表無資料' };

  const values = logSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let deletedCount = 0;
  // 從後往前刪除防止 index 位移
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]).trim() === String(targetYm).trim()) {
      logSheet.deleteRow(i + 2);
      deletedCount++;
    }
  }

  return {
    success: true,
    targetYm: targetYm,
    deletedCount: deletedCount,
    message: '已成功清理 [' + targetYm + '] 測試資料共 ' + deletedCount + ' 列！'
  };
}

/**
 * 建立或格式化「抄表待審核_Queue」暫存工作表
 */
function initQueueSheet() {
  const ss = getAppSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_QUEUE);
  let isCreated = false;

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_QUEUE);
    isCreated = true;
  }

  const expectedHeaders = CONFIG.QUEUE_HEADERS;
  sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);

  const headerRange = sheet.getRange(1, 1, 1, expectedHeaders.length);
  headerRange
    .setBackground('#1e293b')
    .setFontColor('#f8fafc')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);

  const colWidths = {
    1: 160, // ID
    2: 150, // 上傳時間
    3: 120, // 照片
    4: 100, // 專櫃代碼
    5: 140, // 專櫃名稱
    6: 110, // 儀表類別
    7: 100, // 前期度數
    8: 110, // AI辨識度數
    9: 110, // 人工覆核度數
    10: 100, // 本期用量
    11: 100, // 審核狀態
    12: 240, // 審核備註
    13: 140  // 抄表員
  };

  Object.keys(colWidths).forEach(function(colIndex) {
    sheet.setColumnWidth(Number(colIndex), colWidths[colIndex]);
  });

  let logSheet = ss.getSheetByName(CONFIG.SHEET_LOG);
  if (!logSheet && CONFIG.SHEET_LOG_ALT) {
    logSheet = ss.getSheetByName(CONFIG.SHEET_LOG_ALT);
  }
  const logExists = !!logSheet;
  let logHeaders = [];
  if (logExists) {
    logHeaders = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];
  }

  return {
    success: true,
    created: isCreated,
    sheetName: CONFIG.SHEET_QUEUE,
    headers: expectedHeaders,
    logSheetExists: logExists,
    logHeaders: logHeaders,
    message: isCreated 
      ? '成功新建暫存表「' + CONFIG.SHEET_QUEUE + '」，並已完成 13 項標準欄位設定！'
      : '暫存表「' + CONFIG.SHEET_QUEUE + '」已存在，已校正並強化 13 項標準欄位與表頭格式！'
  };
}

/**
 * 清空 Queue 暫存表（保留第 1 列表頭）
 */
function clearQueueSheet() {
  const ss = getAppSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_QUEUE);
  if (!sheet) return { success: false, message: 'Queue 表不存在' };

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  return { success: true, message: '已清空暫存表所有紀錄（保留表頭）' };
}

/**
 * 取得試算表健康狀態
 */
function getSpreadsheetStatus() {
  const ss = getAppSpreadsheet();
  const sheets = ss.getSheets();
  const list = sheets.map(function(s) {
    return {
      name: s.getName(),
      rows: s.getLastRow(),
      cols: s.getLastColumn()
    };
  });

  return {
    title: ss.getName(),
    id: ss.getId(),
    sheets: list
  };
}

/**
 * 查詢主表 Log 資料
 */
function getLogRecords(targetYm) {
  const ss = getAppSpreadsheet();
  const logSheet = ss.getSheetByName(CONFIG.SHEET_LOG) || ss.getSheetByName(CONFIG.SHEET_LOG_ALT);
  if (!logSheet) return { success: false, message: '主表不存在' };

  const lastRow = logSheet.getLastRow();
  if (lastRow <= 1) return { success: true, count: 0, records: [] };

  const values = logSheet.getRange(2, 1, lastRow - 1, 16).getValues();
  const list = [];
  for (let i = 0; i < values.length; i++) {
    const ym = String(values[i][0]).trim();
    if (!targetYm || ym === String(targetYm)) {
      list.push({
        yearMonth: ym,
        code: String(values[i][1]).trim(),
        name: String(values[i][2]).trim(),
        readingDatePrev: values[i][3],
        readingDateCurr: values[i][4],
        elec220Prev: values[i][5],
        elec220Curr: values[i][6],
        elec110Prev: values[i][7],
        elec110Curr: values[i][8],
        waterPrev: values[i][9],
        waterCurr: values[i][10]
      });
    }
  }
  return {
    success: true,
    filterYm: targetYm || 'ALL',
    count: list.length,
    records: list
  };
}

/**
 * 列出待處理資料夾中的照片
 */
function listPendingPhotos() {
  const folder = getAppFolder('pending');
  const files = folder.getFiles();
  const fileList = [];
  
  while (files.hasNext()) {
    const f = files.next();
    fileList.push({
      id: f.getId(),
      name: f.getName(),
      size: f.getSize(),
      mimeType: f.getMimeType(),
      created: Utilities.formatDate(f.getDateCreated(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss'),
      url: f.getUrl(),
      thumbnail: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w800'
    });
  }

  return {
    success: true,
    folderId: folder.getId(),
    folderName: folder.getName(),
    count: fileList.length,
    files: fileList
  };
}

/**
 * 讀取目前 Queue 暫存表中的資料清單
 */
function getQueueRecords() {
  const ss = getAppSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_QUEUE);
  if (!sheet) return { success: false, message: 'Queue 表不存在' };

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, count: 0, records: [] };

  const values = sheet.getRange(2, 1, lastRow - 1, CONFIG.QUEUE_HEADERS.length).getValues();
  const records = values.map(function(row) {
    const obj = {};
    CONFIG.QUEUE_HEADERS.forEach(function(h, cIdx) {
      obj[h] = row[cIdx];
    });
    return obj;
  });

  return {
    success: true,
    count: records.length,
    records: records
  };
}

/**
 * 檢查 Gemini API Key
 */
function checkGeminiApiKey() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  return {
    hasKey: !!key,
    keyPreview: key ? (key.slice(0, 6) + '...' + key.slice(-4)) : null
  };
}

/**
 * 設定指令碼屬性 (通用安全配置)
 */
function saveEnvironmentProperties(props) {
  if (!props || typeof props !== 'object') {
    throw new Error('屬性物件無效');
  }
  const p = PropertiesService.getScriptProperties();
  Object.keys(props).forEach(function(k) {
    if (props[k] !== undefined && props[k] !== null) {
      p.setProperty(k, String(props[k]).trim());
    }
  });
  return { success: true, message: '環境屬性已安全更新至 ScriptProperties！' };
}

/**
 * 呼叫 Gemini Flash 多模態辨識水電儀表
 * 採用【貼紙優先定位】+【儀表度數提取】兩段式高精準 Prompt
 */
function callGeminiVisionApi(imageBlob, apiKey) {
  const bytes = imageBlob.getBytes();
  const base64Image = Utilities.base64Encode(bytes);
  const mimeType = imageBlob.getContentType() || 'image/jpeg';
  
  const systemInstruction = 
    "你是一位專業的商場專櫃水電表抄表審查員。請仔細分析專櫃水電表照片，重點執行以下提取與防呆規則：\n\n" +
    "【步驟一：定位並提取制式貼紙資訊】\n" +
    "每張水電表本體或周圍均貼有白色制式貼紙（旁邊印有 QR Code），貼紙格式為：\n" +
    "『| 專櫃編號 | 專櫃名稱 | 儀表類別 |』例如『| 00066 | BAW | 110 |』。\n" +
    "- counter_code: 請提取貼紙上的專櫃編號（例如 '00066'）。若貼紙無編號則設為空字串。\n" +
    "- counter_name: 請提取貼紙上的專櫃名稱（例如 'BAW'、'夢工廠'）。\n" +
    "- sticker_meter_type: 請提取貼紙上的儀表類別標記：若為 '110' 則為 '110V電表'；若為 '220' 則為 '220V電表'；若為 '水' 則為 '水表'。\n\n" +
    "【步驟二：讀取儀表讀數與防呆】\n" +
    "1. 電子式電表（如大同 EBI-31M、士林 SPM-3 等）：\n" +
    "   - 讀取液晶螢幕上的主度數（例如顯示 '06450.2'，小數點後為第1位）。\n" +
    "   - 單位檢查：螢幕必須顯示 'kWh' 單位才為有效電度數。若單位為 V、A、kW，則 is_valid_reading 設為 false，notes 註明原因。\n" +
    "   - 四捨五入取整數度數（如 6450.2 取 6450）。\n" +
    "2. 機械式電表（如大同 E-31 等）：\n" +
    "   - 黑色字輪為整數，最右側紅框為小數點後第 1 位 (0.1)，四捨五入取整數度數。\n" +
    "3. 水表（如 KC-20C 等）：\n" +
    "   - 僅讀取上方黑色字輪（立方公尺整數度數），下方紅色指針（小數）一律忽略。\n" +
    "4. 畫面旋轉檢查：若巡檢員手機拍照顛倒，請自動校正畫面角度後讀取。\n" +
    "5. 若照片反光黑屏、嚴重模糊無法確認讀數，is_valid_reading 設為 false，notes 說明具體原因。\n\n" +
    "請輸出結構化 JSON 物件。";

  const payload = {
    contents: [
      {
        parts: [
          { text: "請辨識這張照片中的貼紙專櫃資訊與儀表度數：" },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image
            }
          }
        ]
      }
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          counter_code: { type: "STRING", description: "貼紙上的專櫃編號，例如 00066" },
          counter_name: { type: "STRING", description: "貼紙上的專櫃名稱，例如 BAW" },
          meter_type: { type: "STRING", enum: ["110V電表", "220V電表", "水表", "未知"] },
          reading: { type: "NUMBER", description: "四捨五入後之整數累積度數" },
          raw_display: { type: "STRING", description: "螢幕或字輪原始文字，例如 06450.2" },
          unit: { type: "STRING", description: "顯示單位，例如 kWh, m3, V, A, kW" },
          is_valid_reading: { type: "BOOLEAN" },
          notes: { type: "STRING", description: "辨識說明與防呆備註" }
        },
        required: ["counter_code", "counter_name", "meter_type", "reading", "is_valid_reading", "notes"]
      }
    }
  };

  const errors = [];
  for (let i = 0; i < CONFIG.GEMINI_MODELS.length; i++) {
    const model = CONFIG.GEMINI_MODELS[i];
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;
    
    // 每個模型支援 503 重試機制
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) Utilities.sleep(2000);
        const response = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        const code = response.getResponseCode();
        const text = response.getContentText();
        if (code === 200) {
          const json = JSON.parse(text);
          const candidate = json.candidates && json.candidates[0];
          if (candidate && candidate.content && candidate.content.parts && candidate.content.parts[0]) {
            const parsed = JSON.parse(candidate.content.parts[0].text);
            parsed.used_model = model;
            return parsed;
          }
        } else if (code === 503 && attempt === 0) {
          continue;
        } else {
          errors.push("[" + model + " HTTP " + code + "]: " + text.slice(0, 150));
          break;
        }
      } catch (e) {
        errors.push("[" + model + " Exception]: " + e.message);
        break;
      }
    }
  }
  throw new Error("模型呼叫失敗清單: " + errors.join(" | "));
}

/**
 * 檢查專櫃於主檔中的狀態與撤櫃日期 (支援 def_櫃位主檔_Master 表頭動態對齊)
 */
function checkCounterMasterStatus(counterCode, counterName, checkDate) {
  try {
    const ss = getAppSpreadsheet();
    let masterSheet = ss.getSheetByName(CONFIG.SHEET_MASTER) || ss.getSheetByName(CONFIG.SHEET_MASTER_ALT);
    if (!masterSheet) {
      Logger.log('專櫃主檔工作表不存在');
      return { isMasterFound: true, isRetired: false, retireDate: '', status: '在櫃' };
    }

    const lastRow = masterSheet.getLastRow();
    const lastCol = masterSheet.getLastColumn();
    if (lastRow <= 1) {
      return { isMasterFound: true, isRetired: false, retireDate: '', status: '在櫃' };
    }

    // 1. 動態解析表頭欄位位置 (Index 0-based)
    const headers = masterSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    let colCodeIdx = -1;
    let colNameIdx = -1;
    let colStatusIdx = -1;
    let colRetireDateIdx = -1;

    for (let c = 0; c < headers.length; c++) {
      const hStr = String(headers[c]).trim();
      if (hStr === '專櫃編號' || hStr === '專櫃代碼' || hStr === '櫃位編號') {
        colCodeIdx = c;
      } else if (hStr === '專櫃名稱' || hStr === '櫃位名稱') {
        colNameIdx = c;
      } else if (hStr === '專櫃狀態' || hStr === '狀態' || hStr === '營運狀態') {
        colStatusIdx = c;
      } else if (hStr === '撤櫃日期' || hStr === '退櫃日期' || hStr === '結束日期') {
        colRetireDateIdx = c;
      }
    }

    // 若未找到則帶入預設位置 (0:編號, 2:名稱, 3:狀態)
    if (colCodeIdx === -1) colCodeIdx = 0;
    if (colNameIdx === -1) colNameIdx = headers.length >= 3 ? 2 : 1;
    if (colStatusIdx === -1) colStatusIdx = headers.length >= 4 ? 3 : -1;

    const data = masterSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const targetCodeNum = parseInt(counterCode, 10);
    const targetDate = checkDate ? new Date(checkDate) : new Date();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const code = String(row[colCodeIdx]).trim();
      const name = colNameIdx !== -1 ? String(row[colNameIdx]).trim() : '';
      const status = colStatusIdx !== -1 ? String(row[colStatusIdx]).trim() : '';
      const retireDateRaw = colRetireDateIdx !== -1 ? row[colRetireDateIdx] : (colStatusIdx !== -1 ? row[colStatusIdx] : null);

      const codeNum = parseInt(code, 10);

      const codeMatch = counterCode && (code === counterCode || (!isNaN(targetCodeNum) && codeNum === targetCodeNum));
      const nameMatch = counterName && (name && (name.indexOf(counterName) !== -1 || counterName.indexOf(name) !== -1));

      if (codeMatch || nameMatch) {
        let isRetired = false;
        let retireDateStr = '';

        if (status === '已撤櫃' || status === '撤櫃' || status === '停業') {
          isRetired = true;
        }

        if (retireDateRaw) {
          if (retireDateRaw instanceof Date) {
            retireDateStr = Utilities.formatDate(retireDateRaw, 'GMT+8', 'yyyy-MM-dd');
            if (targetDate >= retireDateRaw) {
              isRetired = true;
            }
          } else {
            retireDateStr = String(retireDateRaw).trim();
            if (retireDateStr && retireDateStr !== '已撤櫃' && retireDateStr !== '在櫃') {
              const rDate = new Date(retireDateStr);
              if (!isNaN(rDate.getTime()) && targetDate >= rDate) {
                isRetired = true;
              }
            }
          }
        }

        return {
          isMasterFound: true,
          isRetired: isRetired,
          retireDate: retireDateStr,
          status: status || (isRetired ? '已撤櫃' : '在櫃'),
          masterCode: code,
          masterName: name
        };
      }
    }

    return {
      isMasterFound: false,
      isRetired: false,
      retireDate: '',
      status: '未在主檔'
    };
  } catch (e) {
    Logger.log('檢查專櫃主檔失敗: ' + e.message);
    return { isMasterFound: true, isRetired: false, retireDate: '', status: '未知' };
  }
}

/**
 * 輔助：從主表中查找專櫃前期度數 (優先使用專櫃代碼 counterCode 比對)
 */
function lookupPreviousReading(counterCode, counterName, meterType) {
  try {
    const ss = getAppSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_LOG) || ss.getSheetByName(CONFIG.SHEET_LOG_ALT);
    if (!sheet) return { counterCode: counterCode, counterName: counterName, previousReading: 0 };

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { counterCode: counterCode, counterName: counterName, previousReading: 0 };

    const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();

    // 1. 優先以專櫃代碼比對 (精準比對)
    if (counterCode && String(counterCode).trim() !== '') {
      const targetCodeNum = parseInt(counterCode, 10);
      for (let i = data.length - 1; i >= 0; i--) {
        const rowCode = String(data[i][1]).trim();
        const rowCodeNum = parseInt(rowCode, 10);
        if (rowCode === counterCode || (!isNaN(targetCodeNum) && rowCodeNum === targetCodeNum)) {
          const matchedName = String(data[i][2]).trim();
          let prev = 0;
          if (meterType === '220V電表') {
            prev = Number(data[i][5]) || 0;
          } else if (meterType === '110V電表') {
            prev = Number(data[i][7]) || 0;
          } else if (meterType === '水表') {
            prev = Number(data[i][9]) || 0;
          }
          return { counterCode: rowCode, counterName: matchedName, previousReading: prev };
        }
      }
    }

    // 2. 備援：以專櫃名稱模糊比對
    if (counterName && String(counterName).trim() !== '') {
      for (let i = data.length - 1; i >= 0; i--) {
        const rowName = String(data[i][2]).trim();
        if (rowName && (rowName.indexOf(counterName) !== -1 || counterName.indexOf(rowName) !== -1)) {
          const rowCode = String(data[i][1]).trim();
          let prev = 0;
          if (meterType === '220V電表') {
            prev = Number(data[i][5]) || 0;
          } else if (meterType === '110V電表') {
            prev = Number(data[i][7]) || 0;
          } else if (meterType === '水表') {
            prev = Number(data[i][9]) || 0;
          }
          return { counterCode: rowCode, counterName: rowName, previousReading: prev };
        }
      }
    }
  } catch (e) {
    Logger.log('查找前期度數失敗: ' + e.message);
  }
  return { counterCode: counterCode, counterName: counterName, previousReading: 0 };
}

/**
 * 從字串或網址中解析 Google Drive 檔案 ID
 */
function extractDriveFileId(str) {
  if (!str) return '';
  const s = String(str).trim();
  const m1 = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  const m3 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m3) return m3[1];
  if (/^[a-zA-Z0-9_-]{25,}$/.test(s)) return s;
  return '';
}

/**
 * 安全搬移檔案至目標資料夾，並確保從來源資料夾移除（雙重保證清空）
 */
function safeMoveFile(file, targetFolder, sourceFolder) {
  if (!file || !targetFolder) return;
  try {
    file.moveTo(targetFolder);
  } catch (e) {
    try {
      targetFolder.addFile(file);
      if (sourceFolder) {
        sourceFolder.removeFile(file);
      }
    } catch (err) {
      Logger.log('移檔失敗: ' + err.message);
    }
  }
  // 雙重驗證確保來源資料夾不留存
  if (sourceFolder) {
    try {
      sourceFolder.removeFile(file);
    } catch (e2) {}
  }
}

/**
 * 清理並去重「抄表待審核_Queue」工作表
 * 1. 刪除所有全空白幽靈列
 * 2. 針對尚未過帳（待審核、異常）且相同 (專櫃+儀表類別) 或相同照片的卡片，僅保留最新一筆，清除歷史重複
 */
function deduplicateQueueSheet() {
  const ss = getAppSpreadsheet();
  const queueSheet = ss.getSheetByName(CONFIG.SHEET_QUEUE);
  if (!queueSheet) return { success: false, message: 'Queue 表不存在' };

  const lastRow = queueSheet.getLastRow();
  const numCols = CONFIG.QUEUE_HEADERS.length;
  if (lastRow <= 1) return { success: true, remainingCount: 0, duplicateCount: 0, blankCount: 0, message: 'Queue 表無資料需清理' };

  const values = queueSheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  const cleanRows = [];
  const seenBusinessKeys = new Map(); // busKey -> cleanRows index
  const seenPhotoIds = new Map();     // fileId -> cleanRows index

  let blankCount = 0;
  let duplicateCount = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const recId = String(row[0] || '').trim();
    const photoUrl = String(row[2] || '').trim();
    const code = String(row[3] || '').trim();
    const name = String(row[4] || '').trim();
    const meterType = String(row[5] || '').trim();
    const status = String(row[10] || '').trim();

    // 檢查是否為空行
    const isBlank = !recId && !photoUrl && !code && !name;
    if (isBlank) {
      blankCount++;
      continue;
    }

    const fileId = extractDriveFileId(photoUrl);

    // 防呆：若已經過帳，代表度數已安全寫入主檔，直接自待審核暫存表中移除，保持清爽！
    if (status === '已過帳' || status === '已核准') {
      continue;
    }

    // 業務去重鍵值 (專櫃代碼或名稱 + 儀表類別)
    const busKey = (code ? code : name) + '::' + meterType;

    // 檢查是否有同照片重複
    if (fileId && seenPhotoIds.has(fileId)) {
      const existingIdx = seenPhotoIds.get(fileId);
      cleanRows[existingIdx] = row;
      duplicateCount++;
      continue;
    }

    // 檢查是否有同櫃位同儀表類別待審核重複
    if (busKey !== '::' && busKey !== '未知::未知' && seenBusinessKeys.has(busKey)) {
      const existingIdx = seenBusinessKeys.get(busKey);
      cleanRows[existingIdx] = row;
      duplicateCount++;
      if (fileId) seenPhotoIds.set(fileId, existingIdx);
      continue;
    }

    // 記錄新列
    const currentIdx = cleanRows.length;
    cleanRows.push(row);
    if (busKey !== '::' && busKey !== '未知::未知') {
      seenBusinessKeys.set(busKey, currentIdx);
    }
    if (fileId) {
      seenPhotoIds.set(fileId, currentIdx);
    }
  }

  // 清空資料區並重寫
  queueSheet.getRange(2, 1, lastRow, numCols).clearContent();
  if (cleanRows.length > 0) {
    queueSheet.getRange(2, 1, cleanRows.length, numCols).setValues(cleanRows);
  }

  const msg = 'Queue 表去重清洗完成！保留 ' + cleanRows.length + ' 筆，清除 ' + duplicateCount + ' 筆重複卡片及 ' + blankCount + ' 筆空行。';
  Logger.log(msg);

  return {
    success: true,
    remainingCount: cleanRows.length,
    duplicateCount: duplicateCount,
    blankCount: blankCount,
    message: msg
  };
}

/**
 * 批次處理待處理資料夾中的照片（具備三大去重防呆：照片去重、業務 Upsert 覆蓋更新、移檔保證）
 */
function processPendingMeterPhotos(limit, apiKeyOverride) {
  const apiKey = apiKeyOverride || PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('未設定 Gemini API Key，請先設定金鑰！');
  }

  const maxItems = limit || 5;
  const pendingFolder = getAppFolder('pending');
  const archivedFolder = getAppFolder('archived');
  const reviewFolder = getAppFolder('review');

  const files = pendingFolder.getFiles();
  const processed = [];
  let count = 0;

  const ss = getAppSpreadsheet();
  let queueSheet = ss.getSheetByName(CONFIG.SHEET_QUEUE);
  if (!queueSheet) {
    initQueueSheet();
    queueSheet = ss.getSheetByName(CONFIG.SHEET_QUEUE);
  }

  // 1. 讀取現有 Queue 表，建立已存在照片 File ID 索引與業務列比對快照
  let lastRow = queueSheet.getLastRow();
  let queueData = [];
  const existingPhotoIds = new Set();

  if (lastRow > 1) {
    queueData = queueSheet.getRange(2, 1, lastRow - 1, CONFIG.QUEUE_HEADERS.length).getValues();
    for (let r = 0; r < queueData.length; r++) {
      const pUrl = String(queueData[r][2] || '').trim();
      const pFid = extractDriveFileId(pUrl);
      if (pFid) existingPhotoIds.add(pFid);
    }
  }

  while (files.hasNext() && count < maxItems) {
    const file = files.next();
    const fileName = file.getName();
    const fileId = file.getId();
    count++;

    // 防呆機制一：照片等級去重。若照片 File ID 已存在於 Queue 表中，直接歸檔跳過！
    if (existingPhotoIds.has(fileId)) {
      Logger.log('照片 [' + fileName + '] 已存在於待審核暫存表，執行安全歸檔並略過！');
      safeMoveFile(file, archivedFolder, pendingFolder);
      processed.push({
        fileName: fileName,
        status: '已略過',
        notes: '照片已在待審核表中，自動歸檔免重複辨識'
      });
      continue;
    }

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (se) {}

    let parsedCounterName = '';
    const nameMatch = fileName.match(/^([^_]+)水電/);
    if (nameMatch) {
      parsedCounterName = nameMatch[1];
    }

    try {
      const ocrResult = callGeminiVisionApi(file.getBlob(), apiKey);
      
      const effectiveCode = ocrResult.counter_code || '';
      const effectiveName = ocrResult.counter_name || parsedCounterName || '未知專櫃';
      const meterType = ocrResult.meter_type || '未知';

      // 執行專櫃主檔與撤櫃日期防呆校驗
      const masterCheck = checkCounterMasterStatus(effectiveCode, effectiveName, file.getDateCreated());

      let reading = '';
      let prevReading = 0;
      let usage = '';
      let status = '待審核';
      let notes = ocrResult.notes || '';
      let finalCode = effectiveCode;
      let finalName = effectiveName;

      if (!masterCheck.isMasterFound) {
        // 防呆一：不在專櫃主檔，直接結束，不讀度數
        status = '異常';
        notes = '⚠️ [非主檔專櫃] 專櫃代碼/名稱 [' + (effectiveCode || effectiveName) + '] 未存在於櫃位主檔中，跳過度數辨識！';
      } else if (masterCheck.isRetired) {
        // 防呆二：已經撤櫃，直接結束，不讀度數
        status = '已撤櫃';
        notes = '⚠️ [已撤櫃專櫃] 專櫃 [' + (masterCheck.masterName || effectiveName) + '] 已於 ' + (masterCheck.retireDate || '指定日期') + ' 撤櫃，跳过度數辨識！';
      } else {
        // 正常營業中專櫃：讀取度數與計算用量
        reading = ocrResult.reading !== undefined ? ocrResult.reading : '';
        const isValid = !!ocrResult.is_valid_reading;

        const lookup = lookupPreviousReading(effectiveCode, effectiveName, meterType);
        prevReading = lookup.previousReading;
        finalCode = lookup.counterCode || effectiveCode;
        finalName = lookup.counterName || effectiveName;

        if (isValid && reading !== '') {
          usage = Number(reading) - Number(prevReading);
          if (usage < 0) {
            status = '異常';
            notes = '⚠️ 度數逆轉防呆警示：本期度數 (' + reading + ') 小於前期度數 (' + prevReading + ')！ ' + notes;
          } else {
            status = '待審核';
            notes = '【' + (ocrResult.used_model || 'gemini') + ' 辨識】' + notes;
          }
        } else {
          status = '異常';
          notes = '⚠️ 辨識異常：' + notes;
        }
      }

      const uploadTime = Utilities.formatDate(file.getDateCreated(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss');
      const photoUrl = 'https://lh3.googleusercontent.com/d/' + fileId;

      // 防呆機制二：業務維度 Upsert。比對 Queue 中是否已有同櫃同表別之「待審核」或「異常」記錄
      let matchedRowIdx = -1;
      for (let r = 0; r < queueData.length; r++) {
        const qRow = queueData[r];
        const qCode = String(qRow[3] || '').trim();
        const qName = String(qRow[4] || '').trim();
        const qMeter = String(qRow[5] || '').trim();
        const qStatus = String(qRow[10] || '').trim();

        const isSameCounter = (finalCode && qCode && String(finalCode) === qCode) ||
                              (finalName && qName && finalName === qName);
        const isSameMeter = (meterType && qMeter && meterType === qMeter);
        const isUnfinalized = (qStatus === '待審核' || qStatus === '異常');

        if (isSameCounter && isSameMeter && isUnfinalized) {
          matchedRowIdx = r;
          break;
        }
      }

      let recordId = '';
      if (matchedRowIdx !== -1) {
        // 【就地覆蓋更新 (In-place Upsert)】更新既有列，避免重複產生多張卡片！
        const sheetRowNum = matchedRowIdx + 2;
        recordId = String(queueData[matchedRowIdx][0]);
        notes = '【更新覆蓋最新照片】' + notes;

        // 更新試算表單列資料
        queueSheet.getRange(sheetRowNum, 2).setValue(uploadTime);
        queueSheet.getRange(sheetRowNum, 3).setValue(photoUrl);
        queueSheet.getRange(sheetRowNum, 4).setValue(finalCode);
        queueSheet.getRange(sheetRowNum, 5).setValue(finalName);
        queueSheet.getRange(sheetRowNum, 6).setValue(meterType);
        queueSheet.getRange(sheetRowNum, 7).setValue(prevReading);
        queueSheet.getRange(sheetRowNum, 8).setValue(reading);
        queueSheet.getRange(sheetRowNum, 9).setValue(reading);
        queueSheet.getRange(sheetRowNum, 10).setValue(usage);
        queueSheet.getRange(sheetRowNum, 11).setValue(status);
        queueSheet.getRange(sheetRowNum, 12).setValue(notes);
        queueSheet.getRange(sheetRowNum, 13).setValue('AI自動辨識');

        // 同步更新記憶體快照
        queueData[matchedRowIdx] = [
          recordId, uploadTime, photoUrl, finalCode, finalName, meterType,
          prevReading, reading, reading, usage, status, notes, 'AI自動辨識'
        ];
      } else {
        // 【新增列】
        recordId = 'REC-' + Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMddHHmmss') + '-' + count;
        const rowData = [
          recordId,
          uploadTime,
          photoUrl,
          finalCode,
          finalName,
          meterType,
          prevReading,
          reading,
          reading,
          usage,
          status,
          notes,
          'AI自動辨識'
        ];
        queueSheet.appendRow(rowData);
        queueData.push(rowData);
      }

      existingPhotoIds.add(fileId);

      // 防呆機制三：移檔雙重保證
      if (status === '異常') {
        safeMoveFile(file, reviewFolder, pendingFolder);
      } else {
        safeMoveFile(file, archivedFolder, pendingFolder);
      }

      processed.push({
        fileName: fileName,
        recordId: recordId,
        counterCode: finalCode,
        counterName: finalName,
        meterType: meterType,
        reading: reading,
        usage: usage,
        status: status,
        actionType: (matchedRowIdx !== -1) ? '覆蓋更新既有卡片' : '新增待審核卡片',
        notes: notes,
        model: ocrResult.used_model
      });

      // 頻率保護：避免短時間並發觸發 429 限流
      Utilities.sleep(1500);

    } catch (e) {
      Logger.log('處理照片失敗 (' + fileName + '): ' + e.message);
      safeMoveFile(file, reviewFolder, pendingFolder);
      processed.push({
        fileName: fileName,
        error: e.message,
        status: '失敗'
      });
    }
  }

  return {
    success: true,
    processedCount: processed.length,
    results: processed
  };
}

/**
 * 一鍵修復照片存取權限與更新縮圖網址為 lh3 CDN
 * 確保 AppSheet 圖片縮圖 100% 正常渲染，不再出現 ⚠️ 灰色驚嘆號
 */
function fixPhotosPermissionsAndUrls() {
  const ss = getAppSpreadsheet();
  const queueSheet = ss.getSheetByName(CONFIG.SHEET_QUEUE);
  if (!queueSheet) throw new Error('暫存表不存在');

  const lastRow = queueSheet.getLastRow();
  let updatedCount = 0;
  let sharedFolderCount = 0;

  // 1. 開啟三大資料夾的「知道連結的任何人皆可檢視」權限
  const folderKeys = ['pending', 'archived', 'review'];
  for (let k = 0; k < folderKeys.length; k++) {
    try {
      const folder = getAppFolder(folderKeys[k]);
      if (folder) {
        folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        sharedFolderCount++;
      }
    } catch (fe) {
      Logger.log('設定資料夾權限跳過 (' + folderKeys[k] + '): ' + fe.message);
    }
  }

  // 2. 走訪 Queue 表，修正歷史照片檔案權限與網址
  if (lastRow > 1) {
    const values = queueSheet.getRange(2, 1, lastRow - 1, CONFIG.QUEUE_HEADERS.length).getValues();
    for (let i = 0; i < values.length; i++) {
      const photoVal = String(values[i][2]).trim();
      let fileId = '';
      const m1 = photoVal.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      const m2 = photoVal.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      const m3 = photoVal.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
      if (m1) {
        fileId = m1[1];
      } else if (m2) {
        fileId = m2[1];
      } else if (m3) {
        fileId = m3[1];
      } else if (/^[a-zA-Z0-9_-]{20,}$/.test(photoVal)) {
        fileId = photoVal;
      }

      if (fileId) {
        try {
          const file = DriveApp.getFileById(fileId);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          const newUrl = 'https://lh3.googleusercontent.com/d/' + fileId;
          if (photoVal !== newUrl) {
            queueSheet.getRange(i + 2, 3).setValue(newUrl);
            updatedCount++;
          }
        } catch (err) {
          Logger.log('修復檔案權限失敗 (' + fileId + '): ' + err.message);
        }
      }
    }
  }

  return {
    success: true,
    sharedFolderCount: sharedFolderCount,
    updatedCount: updatedCount,
    message: '成功開啟 ' + sharedFolderCount + ' 個資料夾之公開檢視權限，並修復 ' + updatedCount + ' 筆照片直連縮圖！'
  };
}

/**
 * 一鍵過帳：將合格度數自 Queue 回填至主表
 */
function postVerifiedReadingsToLog() {
  const ss = getAppSpreadsheet();
  const queueSheet = ss.getSheetByName(CONFIG.SHEET_QUEUE);
  let logSheet = ss.getSheetByName(CONFIG.SHEET_LOG) || ss.getSheetByName(CONFIG.SHEET_LOG_ALT);
  
  if (!queueSheet || !logSheet) {
    throw new Error('暫存表或主表不存在');
  }

  const qLastRow = queueSheet.getLastRow();
  if (qLastRow <= 1) {
    return { success: true, count: 0, message: '目前暫存表中無任何待過帳資料！' };
  }

  const qData = queueSheet.getRange(2, 1, qLastRow - 1, CONFIG.QUEUE_HEADERS.length).getValues();
  const logData = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 11).getValues();
  
  let postedCount = 0;
  const todayStr = Utilities.formatDate(new Date(), 'GMT+8', 'yyyy/M/d');

  for (let i = 0; i < qData.length; i++) {
    const qRow = qData[i];
    const status = qRow[10];
    const verifiedReading = qRow[8];
    const counterCode = String(qRow[3]).trim();
    const counterName = String(qRow[4]).trim();
    const meterType = qRow[5];

    if (status !== '異常' && status !== '已過帳' && verifiedReading !== '') {
      for (let j = 0; j < logData.length; j++) {
        const lCode = String(logData[j][1]).trim();
        const lName = String(logData[j][2]).trim();

        const codeMatch = counterCode && (lCode === counterCode || parseInt(lCode, 10) === parseInt(counterCode, 10));
        const nameMatch = counterName && (lName.indexOf(counterName) !== -1 || counterName.indexOf(lName) !== -1);

        if (codeMatch || nameMatch) {
          const targetRow = j + 2;
          logSheet.getRange(targetRow, 5).setValue(todayStr);

          if (meterType === '220V電表') {
            logSheet.getRange(targetRow, 7).setValue(verifiedReading);
          } else if (meterType === '110V電表') {
            logSheet.getRange(targetRow, 9).setValue(verifiedReading);
          } else if (meterType === '水表') {
            logSheet.getRange(targetRow, 11).setValue(verifiedReading);
          }

          queueSheet.getRange(i + 2, 11).setValue('已過帳');
          qRow[10] = '已過帳';
          postedCount++;
          break;
        }
      }
    }
  }

  // 自動清理：將已成功過帳的資料列從「待審核暫存表」中移出，確保 AppSheet 畫面立即清爽
  if (postedCount > 0) {
    const remainingRows = [];
    for (let r = 0; r < qData.length; r++) {
      const row = qData[r];
      const isBlank = !String(row[0] || '').trim() && !String(row[2] || '').trim();
      const isPosted = String(row[10] || '').trim() === '已過帳';
      if (!isBlank && !isPosted) {
        remainingRows.push(row);
      }
    }

    queueSheet.getRange(2, 1, qLastRow, CONFIG.QUEUE_HEADERS.length).clearContent();
    if (remainingRows.length > 0) {
      queueSheet.getRange(2, 1, remainingRows.length, CONFIG.QUEUE_HEADERS.length).setValues(remainingRows);
    }
  }

  return {
    success: true,
    postedCount: postedCount,
    message: '成功將 ' + postedCount + ' 筆合格度數回填至主表，並已自待審核清單中自動移出！'
  };
}

/**
 * 針對 Queue 表中的單一記錄進行即時 AI 辨識
 * 供 AppSheet 單筆重新辨識 Action 調用
 */
function processSingleQueueRecord(recordId, apiKeyOverride) {
  if (!recordId) throw new Error('必須指定 recordId');
  
  const apiKey = apiKeyOverride || PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('未設定 Gemini API Key，請先設定金鑰！');

  const ss = getAppSpreadsheet();
  const queueSheet = ss.getSheetByName(CONFIG.SHEET_QUEUE);
  if (!queueSheet) throw new Error('暫存表不存在');

  const lastRow = queueSheet.getLastRow();
  if (lastRow <= 1) throw new Error('暫存表無任何記錄');

  const data = queueSheet.getRange(2, 1, lastRow - 1, CONFIG.QUEUE_HEADERS.length).getValues();
  let targetRowIndex = -1;
  let targetRow = null;

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(recordId).trim()) {
      targetRowIndex = i + 2;
      targetRow = data[i];
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error('找不到指定 ID 的記錄: ' + recordId);
  }

  const photoVal = String(targetRow[2]).trim();
  let fileId = '';
  const m1 = photoVal.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  const m2 = photoVal.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m1) {
    fileId = m1[1];
  } else if (m2) {
    fileId = m2[1];
  } else if (/^[a-zA-Z0-9_-]{20,}$/.test(photoVal)) {
    fileId = photoVal;
  }

  if (!fileId) {
    throw new Error('無法從照片欄位解析有效的 Google Drive File ID: ' + photoVal);
  }

  const file = DriveApp.getFileById(fileId);
  const ocrResult = callGeminiVisionApi(file.getBlob(), apiKey);

  const effectiveCode = ocrResult.counter_code || '';
  const effectiveName = ocrResult.counter_name || String(targetRow[4]).trim() || '未知專櫃';
  const meterType = ocrResult.meter_type || String(targetRow[5]).trim() || '未知';
  const reading = ocrResult.reading !== undefined ? ocrResult.reading : '';
  const isValid = !!ocrResult.is_valid_reading;

  const lookup = lookupPreviousReading(effectiveCode, effectiveName, meterType);
  const prevReading = lookup.previousReading !== undefined ? lookup.previousReading : targetRow[6];
  const finalCode = lookup.counterCode || effectiveCode || targetRow[3];
  const finalName = lookup.counterName || effectiveName || targetRow[4];

  let usage = '';
  let status = '待審核';
  let notes = ocrResult.notes || '';

  if (isValid && reading !== '') {
    usage = Number(reading) - Number(prevReading);
    if (usage < 0) {
      status = '異常';
      notes = '⚠️ 度數逆轉防呆警示：本期度數 (' + reading + ') 小於前期度數 (' + prevReading + ')！ ' + notes;
    } else {
      status = '正常';
      notes = '【' + (ocrResult.used_model || 'gemini') + ' 重新辨識】' + notes;
    }
  } else {
    status = '異常';
    notes = '⚠️ 辨識異常：' + notes;
  }

  // 回填更新 Queue 該列
  queueSheet.getRange(targetRowIndex, 4).setValue(finalCode);
  queueSheet.getRange(targetRowIndex, 5).setValue(finalName);
  queueSheet.getRange(targetRowIndex, 6).setValue(meterType);
  queueSheet.getRange(targetRowIndex, 7).setValue(prevReading);
  queueSheet.getRange(targetRowIndex, 8).setValue(reading);
  queueSheet.getRange(targetRowIndex, 9).setValue(reading);
  queueSheet.getRange(targetRowIndex, 10).setValue(usage);
  queueSheet.getRange(targetRowIndex, 11).setValue(status);
  queueSheet.getRange(targetRowIndex, 12).setValue(notes);

  return {
    success: true,
    recordId: recordId,
    counterCode: finalCode,
    counterName: finalName,
    meterType: meterType,
    reading: reading,
    usage: usage,
    status: status,
    notes: notes,
    model: ocrResult.used_model
  };
}

/**
 * Web API 閘道入口 (GET)
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'status';
  let responseData = {};

  try {
    if (action === 'initNextMonth') {
      responseData = initializeNextMonthLog();
    } else if (action === 'initQueue') {
      responseData = initQueueSheet();
    } else if (action === 'clearQueue') {
      responseData = clearQueueSheet();
    } else if (action === 'status') {
      responseData = getSpreadsheetStatus();
    } else if (action === 'getLog') {
      const ym = e.parameter.ym || '';
      responseData = getLogRecords(ym);
    } else if (action === 'removeLog' && e.parameter.ym) {
      responseData = removeLogYearMonth(e.parameter.ym);
    } else if (action === 'listPhotos') {
      responseData = listPendingPhotos();
    } else if (action === 'getQueue') {
      responseData = getQueueRecords();
    } else if (action === 'checkApiKey') {
      responseData = checkGeminiApiKey();
    } else if (action === 'saveProps') {
      const props = {
        SPREADSHEET_ID: e.parameter.spreadsheetId,
        FOLDER_PENDING_ID: e.parameter.folderPendingId,
        FOLDER_ARCHIVED_ID: e.parameter.folderArchivedId,
        FOLDER_REVIEW_ID: e.parameter.folderReviewId,
        GEMINI_API_KEY: e.parameter.apiKey
      };
      responseData = saveEnvironmentProperties(props);
    } else if (action === 'processPhotos') {
      const limit = Number(e.parameter.limit) || 2;
      const key = e.parameter.key || '';
      responseData = processPendingMeterPhotos(limit, key);
    } else if (action === 'processSingle' && e.parameter.recordId) {
      responseData = processSingleQueueRecord(e.parameter.recordId, e.parameter.key);
    } else if (action === 'postVerified') {
      responseData = postVerifiedReadingsToLog();
    } else if (action === 'fixPhotos') {
      responseData = fixPhotosPermissionsAndUrls();
    } else if (action === 'dedupQueue') {
      responseData = deduplicateQueueSheet();
    } else if (action === 'getPhotoBase64' && e.parameter.fileId) {
      const file = DriveApp.getFileById(e.parameter.fileId);
      const b64 = Utilities.base64Encode(file.getBlob().getBytes());
      responseData = {
        success: true,
        fileName: file.getName(),
        mimeType: file.getMimeType(),
        base64: b64
      };
    } else {
      responseData = {
        success: false,
        message: '未知的指令 action: ' + action
      };
    }
  } catch (err) {
    responseData = {
      success: false,
      error: err.message,
      stack: err.stack
    };
  }

  const isUserInteractiveAction = (action === 'processPhotos' || action === 'postVerified' || action === 'initNextMonth' || action === 'dedupQueue');

  if (!isUserInteractiveAction || (e && e.parameter && e.parameter.format === 'json')) {
    return ContentService.createTextOutput(JSON.stringify(responseData, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const isOk = !!responseData.success;
  const mainTitle = responseData.message || (isOk ? 'AI 辨識已成功完成！' : '處理提示');
  const detailText = isOk
    ? '照片已成功分析並寫入待審核暫存表。<br><br>👉 <b>請返回 AppSheet 手機 App，點擊右上角 🔄 同步或下拉重新整理</b>，即可看到最新卡片！'
    : ('執行過程遇到提示：' + (responseData.error || responseData.message || '請稍後重試。'));

  const htmlOutput = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>專櫃水電抄表自動化</title>'
    + '<style>'
    + 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }'
    + '.card { background: #1e293b; max-width: 440px; width: 100%; padding: 36px 24px; border-radius: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); text-align: center; border: 1px solid #334155; }'
    + '.icon { font-size: 56px; margin-bottom: 12px; }'
    + 'h2 { font-size: 22px; margin: 0 0 12px; color: #ffffff; }'
    + 'p { font-size: 15px; color: #94a3b8; line-height: 1.6; margin: 0 0 24px; }'
    + '.badge { display: inline-block; background: ' + (isOk ? '#065f46' : '#991b1b') + '; color: ' + (isOk ? '#a7f3d0' : '#fecaca') + '; padding: 6px 16px; border-radius: 9999px; font-size: 14px; font-weight: bold; margin-bottom: 20px; }'
    + '.btn-primary { display: block; background: #10b981; color: white; padding: 16px; border-radius: 14px; text-decoration: none; font-weight: bold; font-size: 17px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); margin-bottom: 14px; transition: all 0.2s; }'
    + '.btn-secondary { display: block; background: #3b82f6; color: white; padding: 14px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 15px; margin-bottom: 12px; }'
    + '.tip-box { background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 14px; font-size: 13px; color: #cbd5e1; text-align: left; line-height: 1.6; margin-top: 18px; }'
    + '</style></head><body>'
    + '<div class="card">'
    + '<div class="icon">' + (isOk ? '🎉🤖' : '⚠️') + '</div>'
    + '<div class="badge">' + (isOk ? 'AI 辨識已順利完成' : '處理提示') + '</div>'
    + '<h2>' + mainTitle + '</h2>'
    + '<p>' + detailText + '</p>'
    + '<a href="appsheet://" class="btn-primary">📱 點此切換回 AppSheet 抄表 App</a>'
    + '<a href="javascript:history.back();" class="btn-secondary">🔙 返回上一頁</a>'
    + '<div class="tip-box">'
    + '💡 <b>現場操作小提醒：</b><br>'
    + '若手機瀏覽器分頁未自動關閉，請<b>直接由螢幕底端向上滑動（或多工切換）</b>回 AppSheet，點擊右上角 🔄 同步，最新辨識的卡片就已經全部就緒囉！'
    + '</div>'
    + '</div>'
    + '<script>'
    + 'setTimeout(function() {'
    + '  try { window.location.href = "appsheet://"; } catch (e) {}'
    + '}, 1200);'
    + '</script>'
    + '</body></html>';

  return HtmlService.createHtmlOutput(htmlOutput)
    .setTitle('專櫃水電抄表系統')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Web API 閘道入口 (POST)
 * 專為 AppSheet Webhook 與外部自動化串接設計
 */
function doPost(e) {
  let params = {};
  if (e && e.postData && e.postData.contents) {
    try {
      params = JSON.parse(e.postData.contents);
    } catch (err) {
      params = e.parameter || {};
    }
  } else if (e && e.parameter) {
    params = e.parameter;
  }

  const action = params.action || (e && e.parameter && e.parameter.action) || 'status';
  let responseData = {};

  try {
    if (action === 'initNextMonth') {
      responseData = initializeNextMonthLog();
    } else if (action === 'processPhotos') {
      const limit = Number(params.limit) || 10;
      const key = params.key || '';
      responseData = processPendingMeterPhotos(limit, key);
    } else if (action === 'processSingle' && params.recordId) {
      responseData = processSingleQueueRecord(params.recordId, params.key);
    } else if (action === 'postVerified') {
      responseData = postVerifiedReadingsToLog();
    } else if (action === 'initQueue') {
      responseData = initQueueSheet();
    } else if (action === 'clearQueue') {
      responseData = clearQueueSheet();
    } else if (action === 'dedupQueue') {
      responseData = deduplicateQueueSheet();
    } else if (action === 'status') {
      responseData = getSpreadsheetStatus();
    } else {
      responseData = {
        success: false,
        message: '未知的 POST 指令 action: ' + action
      };
    }
  } catch (err) {
    responseData = {
      success: false,
      error: err.message,
      stack: err.stack
    };
  }

  return ContentService.createTextOutput(JSON.stringify(responseData, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}
