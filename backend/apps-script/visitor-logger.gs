/** Fab Lab Visitor Logger – Apps Script backend (shareable)
 * Works for:
 *  - Desktop app (POST writes + GET weekly)
 *  - Web app (GET summary/meta; optional public read policy can be added later)
 *
 * IMPORTANT (no secrets in code):
 *   Set API key in Script Properties:
 *   Apps Script → Project Settings → Script properties → Add property:
 *     API_KEY = <your-strong-secret>
 *
 * SHEET HEADER (Sheet1 A1:I1):
 * ts | server_received_ts | staff_id | event_id | seq | reason | notes | school | clock_unsynced
 */

const SHEET_NAME = 'Sheet1';

// Reasons & normalization (reason may be empty)
const REASONS = [
  'Advice','Casting/Molding','Clay Printer','Embroidery Machine','Group Walkthrough','Just Visiting',
  'Laser','PCB','Prototyping','Sewing','Vacuum Former','Shopbot','Shopbot Safety',
  'Vinyl Cutter','Workshop','3D Printer','Booked Visit','Meeting'
];
const REASONS_LC = REASONS.reduce((m, r) => (m[r.toLowerCase()] = r, m), {});
const EXTRA_SYNONYMS = {
  '3d-printer': '3D Printer',
  '3dprinter':  '3D Printer',
  'clay-printer': 'Clay Printer',
  'embroidery': 'Embroidery Machine',     // old → new
  'shapeform machine': 'Vacuum Former',   // old → new
  'vacuum-former': 'Vacuum Former',
  'vacuumformer': 'Vacuum Former',
  'meeting': 'Meeting'
};

// ---------- Helpers ----------
function getApiKey_() {
  return String(PropertiesService.getScriptProperties().getProperty('API_KEY') || '');
}
function okJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function unauthorized_() { return okJson_({ ok:false, error:'unauthorized' }); }
function validKeyFrom_(e, body) {
  const hdrs = (e && e.requestHeaders) || {};
  return (
    (e && e.parameter && e.parameter.key) ||
    (body && body.key) ||
    hdrs['x-api-key'] || hdrs['X-API-KEY'] || hdrs['X-Api-Key'] || ''
  );
}
function normalizeReasonAllowBlank_(input) {
  const s = String(input ?? '').trim();
  if (!s) return ''; // allow empty
  const sl = s.toLowerCase();
  if (REASONS_LC[sl]) return REASONS_LC[sl];
  if (EXTRA_SYNONYMS[sl]) return EXTRA_SYNONYMS[sl];
  return s; // keep unknown text as-is (or return '' to strictly constrain)
}
function toUTCYMD_(dateLike) {
  const d = (dateLike instanceof Date) ? dateLike : new Date(dateLike);
  if (isNaN(d)) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString().slice(0,10);
}
function weekdayMon1Sun7_(d) { // Date in UTC
  const n = d.getUTCDay(); // 0..6 (Sun..Sat)
  return n === 0 ? 7 : n;  // 1..7 (Mon..Sun)
}

// ---------- GET: weekly / summary / meta ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  const op = (p.op || '').toLowerCase();
  const API_KEY = getApiKey_();

  // Require key for all GETs (same policy as your current code)
  if ((p.key || '') !== API_KEY) return unauthorized_();

  if (op === 'weekly') {
    const startIso = p.start, endIso = p.end;
    if (!startIso || !endIso) return okJson_({ ok:false, error:'missing start/end' });

    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (!sh) return okJson_({ ok:false, error:'sheet not found' });

    const values = sh.getDataRange().getValues();
    if (values.length < 2) return okJson_({ ok:true, buckets:{}, today_total:0 });

    const header = values[0];
    const idxTs = header.indexOf('ts');
    if (idxTs < 0) return okJson_({ ok:false, error:'ts column not found' });

    const last = sh.getLastRow();
    if (last < 2) return okJson_({ ok:true, buckets:{}, today_total:0 });

    // Read only ts column for speed
    const tsCol = idxTs + 1;
    const tsVals = sh.getRange(2, tsCol, last - 1, 1).getValues(); // [[ts]]

    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (isNaN(start) || isNaN(end)) return okJson_({ ok:false, error:'bad start/end' });

    const buckets = {}; // YYYY-MM-DD (UTC) -> count
    let todayTotal = 0;
    const todayYMD = new Date().toISOString().slice(0,10); // UTC; Reykjavik ~ UTC

    for (let i = 0; i < tsVals.length; i++) {
      const ts = tsVals[i][0];
      if (!ts) continue;
      const dt = (ts instanceof Date) ? ts : new Date(ts);
      const t = dt.getTime();
      if (isNaN(t)) continue;

      if (t >= start && t < end) {
        const ymd = new Date(t).toISOString().slice(0,10);
        buckets[ymd] = (buckets[ymd] || 0) + 1;
      }
      if (new Date(t).toISOString().slice(0,10) === todayYMD) todayTotal++;
    }

    return okJson_({ ok:true, buckets, today_total: todayTotal });
  }

  if (op === 'meta') {
    return okJson_({ ok:true, reasons: REASONS });
  }

  if (op === 'summary') {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (!sh) return okJson_({ ok:false, error:'sheet not found' });

    const values = sh.getDataRange().getValues();
    if (values.length < 2) {
      return okJson_({ ok:true, today_total:0, week_buckets:{}, by_reason:{}, by_weekday:{}, by_month:{}, by_school:{} });
    }

    const header = values[0];
    const idx = {};
    header.forEach((h,i) => idx[h] = i);

    if (idx.ts == null) return okJson_({ ok:false, error:'ts column not found' });

    const rows = values.slice(1);
    const todayYMD = new Date().toISOString().slice(0,10);

    const by_reason = {};
    const by_weekday = {1:0,2:0,3:0,4:0,5:0,6:0,7:0}; // Mon..Sun
    const by_month = {};   // 'YYYY-MM-01' -> count
    const by_school = {};
    const week_buckets = {}; // 'YYYY-MM-DD' within current week
    let today_total = 0;

    // Current week [Mon..next Mon) in UTC
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const delta = weekdayMon1Sun7_(todayUTC) - 1;
    const weekStart = new Date(todayUTC); weekStart.setUTCDate(todayUTC.getUTCDate() - delta);
    const weekEnd = new Date(weekStart);  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

    for (const r of rows) {
      const ts = r[idx.ts];
      if (!ts) continue;
      const dt = (ts instanceof Date) ? ts : new Date(ts);
      if (isNaN(dt)) continue;

      const t = dt.getTime();
      const ymd = new Date(t).toISOString().slice(0,10);
      if (ymd === todayYMD) today_total++;

      if (dt >= weekStart && dt < weekEnd) {
        week_buckets[ymd] = (week_buckets[ymd] || 0) + 1;
      }

      if (idx.reason != null) {
        const reason = String(r[idx.reason] || '').trim();
        if (reason) by_reason[reason] = (by_reason[reason] || 0) + 1;
      }

      const wd = weekdayMon1Sun7_(new Date(t));
      by_weekday[wd] = (by_weekday[wd] || 0) + 1;

      const monthKey = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1)).toISOString().slice(0,10);
      by_month[monthKey] = (by_month[monthKey] || 0) + 1;

      if (idx.school != null) {
        const school = String(r[idx.school] || '').trim();
        if (school) by_school[school] = (by_school[school] || 0) + 1;
      }
    }

    return okJson_({ ok:true, today_total, week_buckets, by_reason, by_weekday, by_month, by_school });
  }

  return okJson_({ ok:true, hint:"ops: weekly, summary, meta. POST JSON to write." });
}

// ---------- POST: writes (single event or array) ----------
/**
 * Columns (Sheet1):
 * ts | server_received_ts | staff_id | event_id | seq | reason | notes | school | clock_unsynced
 */
function doPost(e) {
  try {
    const API_KEY = getApiKey_();
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const key = validKeyFrom_(e, body);

    // POST always requires a valid key
    if (API_KEY && key !== API_KEY) return unauthorized_();

    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (!sh) return okJson_({ ok:false, error:'sheet not found' });

    const rows = Array.isArray(body) ? body : [body];

    // Lock to prevent interleaved writes
    const lock = LockService.getScriptLock();
    lock.tryLock(5000);
    try {
      const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const idxEventId = header.indexOf('event_id');
      const idxTs = header.indexOf('ts');
      if (idxEventId < 0 || idxTs < 0) {
        return okJson_({ ok:false, error:'required columns not found (need ts and event_id)' });
      }

      // Existing event_id set for dedup
      const last = sh.getLastRow();
      const existing = new Set();
      if (last >= 2) {
        const idCol = idxEventId + 1;
        const idVals = sh.getRange(2, idCol, last - 1, 1).getValues();
        for (let i = 0; i < idVals.length; i++) {
          const v = idVals[i][0];
          if (v) existing.add(String(v));
        }
      }

      const nowIso = new Date().toISOString();
      const out = [];
      let inserted = 0, skipped = 0;

      for (const ev of rows) {
        const eventId = (ev.event_id || '').toString();
        if (eventId && existing.has(eventId)) { skipped++; continue; }

        const reason = normalizeReasonAllowBlank_(ev.reason);
        const notes  = (ev.notes || '').toString();
        const school = (ev.school || '').toString();

        out.push([
          ev.ts || nowIso,                // ts
          nowIso,                         // server_received_ts
          ev.staff_id || '',              // staff_id (optional)
          eventId,                        // event_id
          ev.seq || '',                   // seq
          reason,                         // reason (may be '')
          notes,                          // notes
          school,                         // school (may be '')
          ev.clock_unsynced ? 'yes' : ''  // clock_unsynced
        ]);

        if (eventId) existing.add(eventId);
      }

      if (out.length) {
        const startRow = sh.getLastRow() + 1;
        sh.getRange(startRow, 1, out.length, out[0].length).setValues(out);
        inserted = out.length;
      }

      return okJson_({ ok:true, inserted, skipped });
    } finally {
      try { lock.releaseLock(); } catch (_) {}
    }
  } catch (err) {
    return okJson_({ ok:false, error:String(err) });
  }
}
