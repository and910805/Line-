/***** ===================== CONFIG（安全版） ===================== *****/
// 建議：保持 true，讓 Token/ID/標的名稱都走 Script Properties
const USE_SCRIPT_PROPERTIES = true;

// 下列均為「安全預設值」。實際值請放 Script Properties。
// 若想在本地測試，可暫時填入，但 **不要 commit** 到公開 Repo。
const SPREADSHEET_ID       = '';
const CHANNEL_ACCESS_TOKEN = '';
const CHANNEL_SECRET       = '';

const HERO_IMG_ID     = '';
const MAIN_SHEET_NAME = 'sheet1';
const LOG_SHEET_NAME  = 'logs';
const EXPORT_RANGE_A1 = 'A1:K80';
const EXPORT_FOLDER_ID = '';

/** 主題色（概覽卡片） */
const OVERVIEW_BG    = '#0f172a';
const OVERVIEW_LABEL = '#93a1b8';
const OVERVIEW_VALUE = '#e5e7eb';

/** 預設「可設定清單」（可被 Script Properties: SETTABLE_FIELDS_JSON 覆寫） */
const SETTABLE_FIELDS_DEFAULT = [
  ['Salary', 0], ['Rent', 9000],  ['Phone', 599],
  ['Bank_A', 0], ['Bank_B', 0], ['Bank_C', 0], ['Bank_D', 0],
  ['Stocks_TWD', 0],
  ['Fund_A', 0], ['Fund_B', 0], ['Fund_C', 0],
  ['Exchange_A', 0], ['Exchange_B', 0], ['Exchange_C', 0], ['Exchange_D', 0]
];

/** 預設鍵位對應（可被 Script Properties: MAP_OVERRIDE_JSON 覆寫） */
const MAP_OVERRIDE_DEFAULT = {
  // 餐費
  '累計餐費': 'sheet1!K6',
  '剩餘餐費': 'sheet1!L6',

  // 投資（TWD）
  'Stocks_TWD': 'sheet1!C21',
  'Fund_A': 'sheet1!C25',
  'Fund_B': 'sheet1!C26',
  'Fund_C': 'sheet1!C27',

  // 幣圈（USD）
  'Exchange_A': 'sheet1!C32',
  'Exchange_B': 'sheet1!C33',
  'Exchange_C': 'sheet1!C34',
  'Exchange_D': 'sheet1!C35',

  // 銀行（TWD）
  'Bank_A': 'sheet1!I20',
  'Bank_B': 'sheet1!I21',
  'Bank_C': 'sheet1!I22',
  'Bank_D': 'sheet1!I23',

  // 概覽（公式區）
  '總資產': 'sheet1!J27',
  '報酬率': 'sheet1!J28',
  '報酬':   'sheet1!J29'
};

/***** ===================== 工具：讀 Script Properties ===================== *****/
function getProp_(k) {
  if (!USE_SCRIPT_PROPERTIES) {
    // 回退到檔內常數（不建議在公開 Repo 使用）
    switch (k) {
      case 'SPREADSHEET_ID':       return SPREADSHEET_ID;
      case 'CHANNEL_ACCESS_TOKEN': return CHANNEL_ACCESS_TOKEN;
      case 'CHANNEL_SECRET':       return CHANNEL_SECRET;
      case 'EXPORT_FOLDER_ID':     return EXPORT_FOLDER_ID || '';
      case 'ALLOWED_USERS':        return '';
      case 'HERO_IMG_ID':          return HERO_IMG_ID || '';
      case 'MAIN_SHEET_NAME':      return MAIN_SHEET_NAME;
      case 'LOG_SHEET_NAME':       return LOG_SHEET_NAME;
      case 'EXPORT_RANGE_A1':      return EXPORT_RANGE_A1;
      case 'SETTABLE_FIELDS_JSON': return '';
      case 'MAP_OVERRIDE_JSON':    return '';
    }
  }
  return PropertiesService.getScriptProperties().getProperty(k);
}

function getJsonProp_(k, fallbackObj) {
  const raw = getProp_(k);
  if (!raw) return fallbackObj;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallbackObj;
  } catch (e) {
    console.error('JSON parse error for', k, e);
    return fallbackObj;
  }
}

function getSettableFields_() {
  const arr = getJsonProp_('SETTABLE_FIELDS_JSON', SETTABLE_FIELDS_DEFAULT);
  // 防護：只接受 [label, defaultNumber]
  return (Array.isArray(arr) ? arr : SETTABLE_FIELDS_DEFAULT).filter(
    x => Array.isArray(x) && typeof x[0] === 'string'
  );
}

function getMapOverride_() {
  const obj = getJsonProp_('MAP_OVERRIDE_JSON', MAP_OVERRIDE_DEFAULT);
  return (obj && typeof obj === 'object') ? obj : MAP_OVERRIDE_DEFAULT;
}

/***** ===================== 入口 ===================== *****/
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('NO_BODY');
    }
    // 簽章驗證
    const secret = getProp_('CHANNEL_SECRET');
    const sig = (e.headers && (e.headers['X-Line-Signature'] || e.headers['x-line-signature'])) || '';
    if (secret && !verifyLineSignature_(e.postData.contents, sig, secret)) {
      return ContentService.createTextOutput('BAD_SIGNATURE');
    }

    const body = JSON.parse(e.postData.contents);
    const events = body.events || [];
    const allowed = (getProp_('ALLOWED_USERS') || '').split(',').map(s=>s.trim()).filter(Boolean);
    const map = getEffectiveMap_();

    events.forEach(ev => {
      if (ev.type !== 'message' || ev.message?.type !== 'text') return;

      const uid = ev.source?.userId || '';
      if (allowed.length && !allowed.includes(uid)) {
        replyTextWithQR_(ev.replyToken, '你沒有權限使用此機器人。');
        return;
      }
      handleCommand_(ev.replyToken, (ev.message.text || '').trim(), map, uid);
    });

    return ContentService.createTextOutput('OK');
  } catch (err) {
    console.error(err);
    return ContentService.createTextOutput('ERR');
  }
}

/** 產生 Google Drive 直連（圖片需「知道連結的任何人：檢視者」） */
function driveImageUrl_(id, mode = 'view') {
  const m = (mode === 'download') ? 'download' : 'view';
  return `https://drive.google.com/uc?export=${m}&id=${encodeURIComponent(id)}`;
}

/***** ===================== 指令處理 ===================== *****/
function handleCommand_(replyToken, raw, map, uid) {
  const txt = normalize_(raw);

  // 除錯：查位址 XXX
  let mm = txt.match(/^查位址\s+(\S+)$/);
  if (mm) {
    const k = mm[1];
    const resolved = resolveTargetRange_(k, map, false);
    if (!resolved) replyTextWithQR_(replyToken, `「${k}」未命中任何位置。`);
    else replyTextWithQR_(replyToken, `鍵「${k}」→ ${resolved.sheet.getName()}!${resolved.a1}（來源：${resolved.via}）`);
    return;
  }

  // 主選單
  if (/^(首頁|menu|主選單)$/i.test(txt)) {
    replyFlexWithQR_(replyToken, buildHomeFlex_());
    return;
  }

  // 教學/功能
  if (/^(help|功能|說明)$/i.test(txt)) {
    replyTextWithQR_(replyToken, buildHelpText_());
    return;
  }

  // 餐費使用教學
  if (/^餐費(教學|說明|使用|help)$/i.test(txt)) {
    replyFlexWithQR_(replyToken, buildMealFeeHelpFlex_());
    return;
  }

  // 從這裡開始只宣告一次 m，之後反覆賦值即可
  let m;

  // A) 快速：餐費 50  -> 將 50 加到「累計餐費」（K6）
  m = txt.match(/^餐費\s+(-?\d+(?:\.\d+)?)$/i);
  if (m) {
    const delta  = parseFloat(m[1]);
    const added  = addByKeySmart_('累計餐費', delta, map, uid);
    if (added === false) {
      replyTextWithQR_(replyToken, '找不到「累計餐費」欄位。');
    } else {
      const remain = readByKeySmart_('剩餘餐費', map); // L6（公式會自動帶出）
      replyTextWithQR_(replyToken,
        `餐費 +${formatNumber_(delta)}\n` +
        `累計餐費 = ${formatNumber_(added)}\n` +
        `剩餘餐費 = ${formatNumber_(remain)}`
      );
    }
    return;
  }

  // B) 通用：加 XXX 50  -> 對任何鍵做累加
  m = txt.match(/^(?:加|新增|累計)\s+(\S+)\s+(-?\d+(?:\.\d+)?)$/i);
  if (m) {
    const key    = m[1];
    const delta  = parseFloat(m[2]);
    const added  = addByKeySmart_(key, delta, map, uid);
    if (added === false) {
      replyTextWithQR_(replyToken, `找不到「${key}」。`);
    } else {
      const best = findBestKey_(key, map) || key;
      if ((best === '累計餐費') || /餐費/.test(best)) {
        const remain = readByKeySmart_('剩餘餐費', map);
        replyTextWithQR_(replyToken,
          `已加到「${best}」 +${formatNumber_(delta)}\n` +
          `現在 = ${formatNumber_(added)}\n` +
          `剩餘餐費 = ${formatNumber_(remain)}`
        );
      } else {
        replyTextWithQR_(replyToken,
          `已加到「${best}」 +${formatNumber_(delta)}\n現在 = ${formatNumber_(added)}`
        );
      }
    }
    return;
  }

  // 設定清單（兩段式：先選項目→再輸入金額）
  if (/^設定$/i.test(txt) || /^設定清單$/i.test(txt)) {
    replyFlexWithQR_(replyToken, buildSettingMenu_());
    return;
  }

  // 匯出 CSV
  if (/^輸出\s*csv$/i.test(txt)) {
    const url = exportCsv_();
    replyTextWithQR_(replyToken, url ? `已匯出 CSV：\n${url}` : '匯出失敗，請看日誌。');
    return;
  }

  // 概覽（carousel）
  if (/^輸出\s*概覽$/i.test(txt)) {
    replyFlexWithQR_(replyToken, buildSummaryFlex_(map));
    return;
  }

  // ====== 兩段式設定流程：等待金額 ======
  const pendingKey = getPending_(uid);
  if (pendingKey) {
    if (/^(取消|cancel)$/i.test(txt)) {
      clearPending_(uid);
      replyTextWithQR_(replyToken, '已取消設定。');
      return;
    }
    if (isNumeric_(txt)) {
      const val = parseFloat(txt.replace(/[,，\s]/g,''));
      const ok = writeByKeySmart_(pendingKey, val, map, uid);
      clearPending_(uid);
      if (ok) replyTextWithQR_(replyToken, `已更新「${pendingKey}」為 ${formatNumber_(val)}`);
      else   replyTextWithQR_(replyToken, `找不到「${pendingKey}」，請用「功能」查看可設定項目。`);
      return;
    } else {
      replyTextWithQR_(replyToken, '請輸入數字金額（或輸入「取消」）');
      return;
    }
  }

  // 兩段式：使用者點了「設定 某項目」→ 進入等待金額
  const m2 = txt.match(/^設定\s+(\S+)$/i);
  if (m2) {
    const targetKey = m2[1];
    const bestKey = findBestKey_(targetKey, map);
    if (!bestKey) {
      replyTextWithQR_(replyToken, `找不到「${targetKey}」，請用「設定」查看清單。`);
      return;
    }
    setPending_(uid, bestKey);
    replyTextWithQR_(replyToken, `請輸入「${bestKey}」的金額（數字即可）。\n若要放棄，回覆：取消`);
    return;
  }

  // 既有：一次說清楚「設定/修改 A 12345」
  m = txt.match(/^(設定|修改)\s+(\S+)\s+(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const userKey = m[2];
    const val = parseFloat(m[3]);
    const ok = writeByKeySmart_(userKey, val, map, uid);
    if (ok) {
      const bestKey = findBestKey_(userKey, map) || userKey;
      replyTextWithQR_(replyToken, `已更新「${bestKey}」為 ${formatNumber_(val)}`);
    } else {
      replyTextWithQR_(replyToken, `找不到「${userKey}」，請用「設定」查看清單。`);
    }
    return;
  }

  // 自然語句：把房租改成9000 / 手機月費調整為599 / Salary=42000
  m = txt.match(/^(?:把)?\s*(\S+?)\s*(?:改成|調整為|=)\s*(-?\d+(?:\.\d+)?)/);
  if (m) {
    const userKey = m[1];
    const val = parseFloat(m[2]);
    const ok = writeByKeySmart_(userKey, val, map, uid);
    if (ok) {
      const bestKey = findBestKey_(userKey, map) || userKey;
      replyTextWithQR_(replyToken, `OK，「${bestKey}」→ ${formatNumber_(val)}`);
    } else {
      replyTextWithQR_(replyToken, `找不到「${userKey}」，請用「設定」查看清單。`);
    }
    return;
  }

  // 查詢：查 總資產 / 查 XXX
  m = txt.match(/^查\s+(\S+)$/);
  if (m) {
    const userKey = m[1];
    const val = readByKeySmart_(userKey, map);
    if (val == null || val === '') {
      replyTextWithQR_(replyToken, `查不到「${userKey}」。`);
    } else {
      const bestKey = findBestKey_(userKey, map) || userKey;
      replyTextWithQR_(replyToken, `「${bestKey}」= ${formatNumber_(val)}`);
    }
    return;
  }

  // fallback
  replyTextWithQR_(replyToken, '看不懂你的指令 😅\n輸入「功能」看用法。');
}

/***** ===================== UI：Flex / 文案 ===================== *****/
function buildHomeFlex_() {
  let heroId = getProp_('HERO_IMG_ID') || HERO_IMG_ID || '';
  let heroUrl = heroId ? driveImageUrl_(heroId, 'view')
                       : 'https://raw.githubusercontent.com/github/explore/main/topics/javascript/javascript.png';

  if (heroId) {
    try {
      const res = UrlFetchApp.fetch(heroUrl, { muteHttpExceptions: true });
      const ct = res.getHeaders()['Content-Type'] || '';
      if (res.getResponseCode() !== 200 || !/^image\//i.test(ct)) throw new Error('Not image');
    } catch (e) {
      heroUrl = 'https://raw.githubusercontent.com/github/explore/main/topics/javascript/javascript.png';
    }
  }

  return {
    type: 'flex',
    altText: '功能首頁',
    contents: {
      type: 'bubble',
      hero: { type:'image', url: heroUrl, size:'full', aspectRatio:'20:13', aspectMode:'cover' },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type:'button', style:'secondary', action:{ type:'message', label:'＋ 設定', text:'設定' } },
          { type:'button', style:'secondary', action:{ type:'message', label:'查 總資產', text:'查 總資產' } },
          { type:'button', style:'secondary', action:{ type:'message', label:'輸出 概覽', text:'輸出 概覽' } },
          { type:'button', style:'secondary', action:{ type:'message', label:'餐費使用教學', text:'餐費教學' } }
        ]
      }
    }
  };
}

function buildHelpText_(){
  return [
    '【常用】',
    '．首頁 / menu / 主選單',
    '．功能 / 說明 / help',
    '．設定（開啟設定清單）',
    '．查 XXX（例：查 總資產）',
    '．輸出 概覽 / 輸出 CSV',
    '',
    '【餐費專用】',
    '．餐費 <金額>：例如「餐費 50」會把 50 加到 K6（累計餐費）',
    '．查 剩餘餐費：讀 L6（由表內公式自動算，不會被覆寫）',
    '．加 餐費 <金額>：等同餐費累加',
    '．餐費教學：顯示使用說明與快捷按鈕',
    '',
    '【設定方式】',
    '① 兩段式：輸入「設定」→ 點選項目 → 輸入金額（可「取消」）',
    '② 一次說清楚：設定 Salary 42000',
    '③ 自然語句：把 Rent 改成 9000、Phone 調整為 599、Salary=42000'
  ].join('\n');
}

function buildSettingMenu_(){
  return {
    type: 'flex',
    altText: '設定教學與清單',
    contents: {
      type: 'carousel',
      contents: [
        buildSettingGuideBubble_(),
        buildSettingListBubble_()
      ]
    }
  };
}

function buildSettingGuideBubble_(){
  const lines = [
    '你可以用以下兩種方式設定數值：',
    '1) 明確格式：設定 Salary 42000',
    '2) 自然語句：把 Rent 改成 9000 / Phone 調整為 599 / Salary=42000',
    '',
    '點下方按鈕可開啟項目清單。'
  ].join('\n');
  return {
    type: 'bubble',
    header: { type:'box', layout:'vertical', contents:[
      { type:'text', text:'設定教學', weight:'bold', size:'md' }
    ]},
    body: { type:'box', layout:'vertical', spacing:'md', contents:[
      { type:'text', text: lines, wrap:true, size:'sm' },
      { type:'separator', margin:'md' },
      { type:'button', style:'secondary', action:{ type:'message', label:'開啟設定清單', text:'設定清單' } }
    ]}
  };
}

function buildSettingListBubble_(){
  const buttons = getSettableFields_().map(([label]) => ({
    type:'button', style:'secondary', margin:'sm',
    action:{ type:'message', label: label, text:`設定 ${label}` }
  }));
  return {
    type: 'bubble',
    header: { type:'box', layout:'vertical', contents:[
      { type:'text', text:'選擇要設定的項目', weight:'bold', size:'md' },
      { type:'text', text:'（點選後輸入金額；可回覆「取消」）', size:'xs', color:'#888888' }
    ]},
    body: { type:'box', layout:'vertical', spacing:'sm', contents: buttons }
  };
}

/** 餐費使用教學 Flex */
function buildMealFeeHelpFlex_(){
  const steps = [
    '1) 新增餐費：輸入「餐費 50」會把 50 加到 K6（累計餐費）',
    '2) 扣回餐費：輸入「餐費 -50」可以減少累計金額',
    '3) 查詢剩餘：輸入「查 剩餘餐費」讀 L6（公式計算）',
    '4) 兩段式設定：輸入「設定 累計餐費」→ 回覆金額；中途可「取消」',
    '5) 進階：也可用「加 餐費 50」達成同效果'
  ].join('\n');

  return {
    type: 'flex',
    altText: '餐費使用教學',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        contents: [{ type:'text', text:'餐費使用教學', weight:'bold', size:'md' }]
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type:'box', layout:'vertical', contents:[
            { type:'text', text:'K6=累計餐費（持續相加）', size:'sm', weight:'bold' },
            { type:'text', text:'L6=剩餘餐費（由表內公式自動帶出，不會被覆寫）', size:'sm' }
          ]},
          { type:'separator' },
          { type:'text', text: steps, wrap:true, size:'sm' },
          { type:'separator' },
          { type:'box', layout:'vertical', spacing:'sm', contents:[
            { type:'text', text:'快速範例', weight:'bold', size:'sm' },
            { type:'box', layout:'vertical', spacing:'xs', contents:[
              { type:'text', text:'餐費 50   → 累計+50', size:'sm' },
              { type:'text', text:'餐費 -30  → 累計-30', size:'sm' },
              { type:'text', text:'查 剩餘餐費 → 顯示 L6', size:'sm' }
            ]}
          ]}
        ]
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'md',
        contents: [
          { type:'button', style:'secondary', action:{ type:'message', label:'餐費 50', text:'餐費 50' } },
          { type:'button', style:'secondary', action:{ type:'message', label:'查剩餘', text:'查 剩餘餐費' } },
          { type:'button', style:'secondary', action:{ type:'message', label:'二段式設定', text:'設定 累計餐費' } }
        ]
      }
    }
  };
}

/***** 概覽 Flex：carousel + 上色 *****/
function buildSummaryFlex_(map) {
  // —— 讀核心：用「報酬 / 總資產」重算報酬率 —— 
  const total = readByKeySmart_('總資產', map);
  const pnl   = readByKeySmart_('報酬', map);
  const roiVal = (total && !isNaN(total)) ? (parseFloat(pnl) / parseFloat(total)) : null;

  // —— 輔助：數字 & 色彩 —— 
  const toNum = v => (typeof v === 'number') ? v : parseFloat(String(v).replace(/[,，]/g,''));
  const signColor = n => (n == null || isNaN(n)) ? '#a1a1aa' : (n > 0 ? '#16a34a' : (n < 0 ? '#ef4444' : '#a1a1aa'));
  const NEUTRAL_VALUE_COLOR = '#111111'; // 分區數字預設用中性顏色

  const moneyStr = (v, unit) => {
    if (v == null || v === '' || isNaN(toNum(v))) return '-';
    const s = toNum(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
    return unit === 'USD' ? ('US$ ' + s) : s;
  };
  const percentStr = v => (v == null || isNaN(toNum(v))) ? '-' : (toNum(v) * 100).toFixed(2) + '%';

  // —— 分組（可自行調整顯示哪些鍵）——
  const GROUPS = [
    { title: '銀行存款（TWD）',        unit: 'TWD', keys: ['Bank_A','Bank_B','Bank_C','Bank_D'],         coloredKeys: [] },
    { title: '投資（股票/基金，TWD）', unit: 'TWD', keys: ['Stocks_TWD','Fund_A','Fund_B','Fund_C'],     coloredKeys: [] },
    { title: '加密資產（USD）',        unit: 'USD', keys: ['Exchange_A','Exchange_B','Exchange_C','Exchange_D'], coloredKeys: [] },
    { title: '固定收支（TWD）',        unit: 'TWD', keys: ['Salary','Rent','Phone','剩餘餐費'],             coloredKeys: ['剩餘餐費'] }
  ];

  const makeRow = (label, value, unit, colored=false) => ({
    type: 'box', layout: 'baseline',
    contents: [
      { type: 'text', text: label, flex: 5, size: 'sm', color: '#999999', wrap: true },
      { type: 'text', text: moneyStr(value, unit), flex: 4, size: 'sm', align: 'end',
        color: colored ? signColor(toNum(value)) : NEUTRAL_VALUE_COLOR }
    ]
  });

  const sectionBody = (title, unit, keys, coloredKeys=[]) => {
    const rows = [];
    keys.forEach(k => {
      const v = readByKeySmart_(k, map);
      if (v !== null) rows.push(makeRow(k, v, unit, coloredKeys.includes(k)));
    });
    if (!rows.length) return null;
    return {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: title, weight: 'bold', size: 'md' }
      ]},
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: rows }
    };
  };

  const heroId = getProp_('HERO_IMG_ID') || HERO_IMG_ID || '';
  const heroUrl = heroId ? driveImageUrl_(heroId, 'view')
                         : 'https://raw.githubusercontent.com/github/explore/main/topics/javascript/javascript.png';
  const overviewBubble = {
    type: 'bubble',
    styles: { header: { backgroundColor: OVERVIEW_BG }, body: { backgroundColor: OVERVIEW_BG } },
    hero:   { type:'image', url: heroUrl, size:'full', aspectRatio:'20:9', aspectMode:'cover' },
    header: { type:'box', layout:'vertical', contents:[
      { type:'text', text:'收支概覽', weight:'bold', size:'md', color: OVERVIEW_VALUE }
    ]},
    body: { type:'box', layout:'vertical', spacing:'sm', contents:[
      { type:'box', layout:'baseline', contents:[
        { type:'text', text:'總資產', size:'sm', color: OVERVIEW_LABEL, flex:5 },
        { type:'text', text: moneyStr(total,'TWD'), size:'sm', weight:'bold', align:'end', flex:4, color: OVERVIEW_VALUE }
      ]},
      { type:'box', layout:'baseline', contents:[
        { type:'text', text:'報酬', size:'sm', color: OVERVIEW_LABEL, flex:5 },
        { type:'text', text: moneyStr(pnl,'TWD'), size:'sm', align:'end', flex:4, color: signColor(toNum(pnl)) }
      ]},
      { type:'box', layout:'baseline', contents:[
        { type:'text', text:'報酬率', size:'sm', color: OVERVIEW_LABEL, flex:5 },
        { type:'text', text: percentStr(roiVal), size:'sm', align:'end', flex:4, color: signColor(roiVal) }
      ]}
    ]}
  };

  const bubbles = [overviewBubble];
  GROUPS.forEach(g => {
    const b = sectionBody(g.title, g.unit, g.keys, g.coloredKeys);
    if (b) bubbles.push(b);
  });

  return { type: 'flex', altText: '收支概覽', contents: { type: 'carousel', contents: bubbles } };
}

/***** ===================== LINE 回覆 ===================== *****/
function quickReplyDefault_(){
  return {
    items: [
      { type:'action', action:{ type:'message', label:'＋設定',   text:'設定' } },
      { type:'action', action:{ type:'message', label:'查總資產', text:'查 總資產' } },
      { type:'action', action:{ type:'message', label:'概覽',    text:'輸出 概覽' } },
      { type:'action', action:{ type:'message', label:'CSV',     text:'輸出 CSV' } },
      { type:'action', action:{ type:'message', label:'餐費教學', text:'餐費教學' } },
      { type:'action', action:{ type:'message', label:'功能',    text:'功能' } }
    ]
  };
}
function replyTextWithQR_(replyToken, text){
  const payload = { replyToken, messages: [{ type: 'text', text, quickReply: quickReplyDefault_() }] };
  lineReply_(payload);
}
function replyFlexWithQR_(replyToken, payload) {
  const msg = Object.assign({}, payload);
  msg.quickReply = quickReplyDefault_();
  lineReply_({ replyToken, messages: [msg] });
}
function lineReply_(payload) {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { 'Authorization': `Bearer ${getProp_('CHANNEL_ACCESS_TOKEN')}` },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) {
    console.error('LINE reply error:', res.getResponseCode(), res.getContentText());
  }
}

/***** ===================== 驗簽 / 工具 ===================== *****/
function verifyLineSignature_(rawBody, signature, secret) {
  if (!secret || !signature) return true;
  const mac = Utilities.computeHmacSha256Signature(rawBody, secret);
  const base64 = Utilities.base64Encode(mac);
  return base64 === signature;
}
function normalize_(s) {
  return String(s || '').replace(/[，、]/g, ' ').replace(/\s+/g, ' ').trim();
}
function formatNumber_(v) {
  if (v == null || v === '') return '';
  const num = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,，]/g,''));
  if (isNaN(num)) return String(v);
  return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
}
function toNumber_(v){
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v || '').replace(/[,，\s]/g,''));
  return isNaN(n) ? 0 : n;
}

/** 將某鍵 += delta，成功回傳新值（數字），失敗回 false */
function addByKeySmart_(userKey, delta, map, uid){
  const bestKey = findBestKey_(userKey, map);
  if (!bestKey) return false;
  const curr  = toNumber_(readByKey_(bestKey, map));
  const d     = toNumber_(delta);
  const next  = curr + d;
  const ok    = writeByKey_(bestKey, next, map);
  if (ok) logChange_('ADD', bestKey, d, uid);
  return ok ? next : false;
}

function logChange_(action, key, val, uid) {
  try {
    const ss = SpreadsheetApp.openById(getProp_('SPREADSHEET_ID'));
    const name = getProp_('LOG_SHEET_NAME') || LOG_SHEET_NAME;
    let log = ss.getSheetByName(name);
    if (!log) log = ss.insertSheet(name);
    log.appendRow([new Date(), action, key, val, uid || '']);
  } catch (e) {
    console.error('logChange_ error', e);
  }
}

/***** ===================== 狀態：等待金額 ===================== *****/
function setPending_(uid, key) { CacheService.getScriptCache().put(`pending:${uid}`, key, 600); }
function getPending_(uid)      { return CacheService.getScriptCache().get(`pending:${uid}`); }
function clearPending_(uid)    { CacheService.getScriptCache().remove(`pending:${uid}`); }
function isNumeric_(s)         { return /^-?\d+(?:\.\d+)?$/.test(String(s).replace(/[,，\s]/g,'')); }

/***** ===================== 讀寫 / 模糊比對 ===================== *****/
const ALIASES = {
  '累計餐費': ['餐費','伙食費','吃飯','餐'],
  '剩餘餐費': ['餐費剩餘','剩餘餐費','剩餐費','剩餘'],
  // 銀行
  'Bank_A': ['BankA','銀行A'],
  'Bank_B': ['BankB','銀行B'],
  'Bank_C': ['BankC','銀行C'],
  'Bank_D': ['BankD','銀行D'],
  // 固定收支
  'Salary': ['薪水','月薪','本薪'],
  'Phone': ['手機月費','手機費','電話費','電信費'],
  'Rent': ['房租','租金'],
  // 加密/平台
  'Exchange_A': ['交易所A','EX_A'],
  'Exchange_B': ['交易所B','EX_B'],
  'Exchange_C': ['交易所C','EX_C'],
  'Exchange_D': ['交易所D','EX_D'],
  // 投資標的（匿名化）
  'Stocks_TWD': ['股票餘額','證券餘額','股市餘額'],
  'Fund_A': ['基金A','FundA'],
  'Fund_B': ['基金B','FundB'],
  'Fund_C': ['基金C','FundC'],
  // 概覽
  '總資產': ['資產總計','總資','總資産'],
  '報酬率': ['投報率','ROI'],
  '報酬': ['盈虧','損益','收益']
};

function jwSim_(s1, s2){
  s1 = String(s1||'').trim().toLowerCase();
  s2 = String(s2||'').trim().toLowerCase();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const matchDist = Math.floor(Math.max(s1.length, s2.length)/2)-1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let matches = 0, transpositions = 0;
  for (let i=0;i<s1.length;i++){
    const start = Math.max(0, i - matchDist), end = Math.min(i + matchDist + 1, s2.length);
    for (let j=start;j<end;j++){
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true; s2Matches[j] = true; matches++; break;
    }
  }
  if (matches === 0) return 0;
  for (let i=0,k=0;i<s1.length;i++){
    if (!s1Matches[i]) continue;
    while(!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  transpositions /= 2;
  const jaro = (matches/s1.length + matches/s2.length + (matches - transpositions)/matches)/3;
  let prefix=0;
  for (let i=0;i<Math.min(4, s1.length, s2.length); i++){
    if (s1[i] === s2[i]) prefix++; else break;
  }
  return jaro + prefix*0.1*(1-jaro);
}

function findBestKey_(userKey, map){
  if (!map) return null;
  if (map[userKey]) return userKey;

  const stdKeys = Object.keys(map);
  const candidates = new Set(stdKeys);
  for (const [std, alis] of Object.entries(ALIASES)){
    if (stdKeys.includes(std)) { candidates.add(std); alis.forEach(a => candidates.add(a)); }
  }

  let best = {key: null, score: 0};
  candidates.forEach(k=>{
    let stdKey = k;
    if (!map[k]) {
      const owner = Object.entries(ALIASES).find(([std, alis]) => alis.includes(k));
      if (owner && map[owner[0]]) stdKey = owner[0];
    }
    const score = jwSim_(userKey, k);
    if (score > best.score) best = {key: stdKey, score};
  });
  return (best.score >= 0.86 && map[best.key]) ? best.key : null;
}

function getEffectiveMap_(){
  return getMapOverride_();
}

function readByKeySmart_(userKey, map){
  const bestKey = findBestKey_(userKey, map);
  if (bestKey) return readByKey_(bestKey, map);
  return readByKey_(userKey, null);
}
function writeByKeySmart_(userKey, val, map, uid){
  const bestKey = findBestKey_(userKey, map);
  const ok = bestKey ? writeByKey_(bestKey, val, map) : writeByKey_(userKey, val, null);
  if (ok) logChange_('SET', bestKey || userKey, val, uid);
  return ok;
}

/** 解析 '工作表!A1' */
function splitSheetA1_(ref) {
  const m = String(ref || '').match(/^([^!]+)!(.+)$/);
  return m ? { sheetName: m[1], a1: m[2] } : { sheetName: null, a1: ref };
}
function getSheetFlexible_(ss, preferSheetName) {
  const name = getProp_('MAIN_SHEET_NAME') || MAIN_SHEET_NAME;
  if (preferSheetName) {
    const s = ss.getSheetByName(preferSheetName);
    if (s) return s;
  }
  const s1 = ss.getSheetByName(name);
  if (s1) return s1;
  return ss.getSheets()[0];
}
/** 解析某 key 的（sheet, a1, via） */
function resolveTargetRange_(key, map, writeMode) {
  const ss = SpreadsheetApp.openById(getProp_('SPREADSHEET_ID'));
  if (map && map[key]) {
    const { sheetName, a1 } = splitSheetA1_(map[key]);
    const sheet = getSheetFlexible_(ss, sheetName);
    return sheet ? { sheet, a1, via: 'override' } : null;
  }
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const a1 = autoLocateA1_(sheets[i], key, !!writeMode);
    if (a1) return { sheet: sheets[i], a1, via: 'auto' };
  }
  return null;
}
function readByKey_(key, map) {
  const resolved = resolveTargetRange_(key, map, false);
  if (!resolved) return null;
  return resolved.sheet.getRange(resolved.a1).getValue();
}
function writeByKey_(key, val, map) {
  const resolved = resolveTargetRange_(key, map, true);
  if (!resolved) return false;
  resolved.sheet.getRange(resolved.a1).setValue(val);
  return true;
}

/** 自動定位：掃一張表，找 key 右/下近鄰數字格 */
function autoLocateA1_(sheet, key, writeMode=false) {
  const rng = sheet.getDataRange();
  const vals = rng.getValues();
  const rows = vals.length;
  const cols = vals[0]?.length || 0;

  const isNumberLike = (v) => {
    if (v == null || v === '') return false;
    if (typeof v === 'number') return true;
    const s = String(v).replace(/[,，\s]/g,'');
    return /^-?\d+(\.\d+)?$/.test(s);
  };
  const norm = s => String(s || '').replace(/\s+/g, '').replace(/\n/g, '').trim();

  const toA1_ = (r, c) => {
    let n = c + 1, s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s + (r + 1);
  };

  const scanNumericNeighbor = (r, c) => {
    const cand = [
      [r, c + 1], [r + 1, c],
      [r, c + 2], [r, c + 3],
      [r + 2, c], [r + 3, c],
    ].filter(([rr, cc]) => rr < rows && cc < cols);

    for (const [rr, cc] of cand) {
      const v = vals[rr][cc];
      if (writeMode || isNumberLike(v)) return toA1_(rr, cc);
    }
    return null;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (norm(vals[r][c]) === norm(key)) {
        const a1 = scanNumericNeighbor(r, c);
        if (a1) return a1;
      }
    }
  }

  let best = { r: -1, c: -1, score: 0 };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = vals[r][c];
      if (typeof v !== 'string' || !v.trim()) continue;
      const score = jwSim_(v, key);
      if (score > best.score) best = { r, c, score };
    }
  }
  if (best.score >= 0.90) {
    const a1 = scanNumericNeighbor(best.r, best.c);
    if (a1) return a1;
  }
  return null;
}

/***** ===================== 匯出 CSV ===================== *****/
function exportCsv_() {
  const ssId = getProp_('SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);
  const sheetName = getProp_('MAIN_SHEET_NAME') || MAIN_SHEET_NAME;
  const sheet = ss.getSheetByName(sheetName) || ss.getSheets()[0];
  if (!sheet) return null;

  const rangeStr = getProp_('EXPORT_RANGE_A1') || EXPORT_RANGE_A1;
  const rng = sheet.getRange(rangeStr);
  const values = rng.getValues();
  const csv = toCsv_(values);

  const folderId = getProp_('EXPORT_FOLDER_ID') || EXPORT_FOLDER_ID;
  const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();

  const name = `export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
  const file = folder.createFile(name, csv, MimeType.PLAIN_TEXT);
  return file.getUrl();
}
function toCsv_(rows) {
  return rows.map(r => r.map(v => {
    const s = (v == null) ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}
