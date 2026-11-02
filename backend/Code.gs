/**
 * PANCHANAN VILLA — Booking backend (Google Apps Script + Google Sheet)
 * ---------------------------------------------------------------------
 * • Database ............ Google Sheet tab "Bookings" (auto-created)
 * • Payments ............ PayU (hash generated + verified here; SALT never reaches the browser)
 * • Acknowledgement ..... HTML email to guest + owner; optional WhatsApp Cloud API
 * • Reports ............. ?action=csv&key=ADMIN_KEY  (CSV download)  /  admin.html
 *
 * Script Properties (Project Settings → Script properties):
 *   PAYU_KEY, PAYU_SALT, PAYU_MODE (test|live), ADMIN_KEY, OWNER_EMAIL,
 *   SITE_URL (https://pvila.in), OWNER_WA (919831635374)
 *   Optional WhatsApp Cloud API: WA_TOKEN, WA_PHONE_ID, WA_TEMPLATE, WA_LANG (en)
 */

/* ---- Tariff: keep in sync with assets/js/config.js (server is authoritative) ---- */
var PRICES = { GF: 15000, F1: 18000, F2: 18000, RT: 12000, ALL: 55000 };
var NAMES  = { GF: 'Ground Floor — Grand Lounge', F1: 'First Floor — Garden Suite', F2: 'Second Floor — Sky Suite', RT: 'Rooftop Terrace', ALL: 'Entire Villa — 3 Floors + Rooftop' };
var CAPACITY = { GF: 60, F1: 12, F2: 12, RT: 80, ALL: 150 };
var ADVANCE_PERCENT = 100, SECURITY_DEPOSIT = 10000;
var PENDING_HOLD_MIN = 20;   // unpaid bookings hold the dates for this many minutes

var SHEET = 'Bookings';
var COLS = ['id','token','createdAt','status','name','phone','email','spaces','checkIn','checkOut','days','guests',
            'purpose','idType','address','notes','subtotal','total','payNow','balance','txnid','payuId','payMode',
            'paidAt','payuStatus','errorMsg','rulesAccepted','emailSent','waSent'];

function P(k, d) { var v = PropertiesService.getScriptProperties().getProperty(k); return v == null || v === '' ? d : v; }

/* ============================ ENTRY POINTS ============================ */
function doGet(e) {
  var p = e.parameter || {};
  try {
    if (p.action === 'availability') return json({ ok: true, busy: busyMap_(p.from, p.to) });
    if (p.action === 'calendar')     return json({ ok: true, items: calendarItems_(p.from, p.to) });
    if (p.action === 'status')       return json(statusFor_(p.id, p.t));
    if (p.action === 'list')         { requireAdmin_(p.key); return json({ ok: true, rows: allRows_().reverse().map(publicRow_) }); }
    if (p.action === 'csv')          { requireAdmin_(p.key); return csvOut_(); }
    return json({ ok: true, service: 'Panchanan Villa booking API' });
  } catch (err) { return json({ ok: false, error: String(err.message || err) }); }
}

function doPost(e) {
  var p = e.parameter || {};
  // PayU returns to surl/furl with form-encoded fields incl. txnid + hash
  if (p.txnid && p.hash) return payuReturn_(p);
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'create') return json(create_(body.booking || {}));
    return json({ ok: false, error: 'Unknown action' });
  } catch (err) { return json({ ok: false, error: String(err.message || err) }); }
}

/* ============================ CREATE BOOKING ============================ */
function create_(b) {
  // ---- validate & sanitise ----
  var name = clean_(b.name, 60), email = clean_(b.email, 80).toLowerCase(), phone = String(b.phone || '').replace(/\D/g, '').slice(-10);
  if (name.length < 3) throw new Error('Please enter your full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email.');
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Please enter a valid 10-digit mobile number.');
  if (!isoDate_(b.checkIn) || !isoDate_(b.checkOut) || b.checkOut <= b.checkIn) throw new Error('Invalid dates.');
  if (b.checkIn < todayIST_()) throw new Error('Check-in date cannot be in the past.');
  if (b.rulesAccepted !== true) throw new Error('House rules must be accepted.');
  var ids = (b.spaces || []).filter(function (s) { return PRICES.hasOwnProperty(s); });
  if (!ids.length) throw new Error('Select at least one space.');
  if (ids.indexOf('ALL') > -1 || ['GF','F1','F2','RT'].every(function (s) { return ids.indexOf(s) > -1; })) ids = ['ALL'];

  var days = Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 864e5);
  if (days > 30) throw new Error('For stays over 30 days please contact us on WhatsApp.');
  var guests = Math.max(1, parseInt(b.guests, 10) || 1);
  var cap = ids.reduce(function (t, s) { return t + CAPACITY[s]; }, 0);
  if (guests > cap) throw new Error('Maximum ' + cap + ' guests for the selected spaces.');

  var perDay = ids.reduce(function (t, s) { return t + PRICES[s]; }, 0);
  var subtotal = perDay * days, total = subtotal;
  var payNow = Math.round(total * ADVANCE_PERCENT / 100);

  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (clash_(ids, b.checkIn, b.checkOut, phone)) throw new Error('Sorry — one or more selected spaces were just booked for these dates. Please choose other dates or spaces.');
    var now = new Date();
    var id = 'PV-' + Utilities.formatDate(now, 'Asia/Kolkata', 'yyMMdd') + '-' + (1000 + Math.floor(Math.random() * 9000));
    var rec = {
      id: id, token: Utilities.getUuid().replace(/-/g, '').slice(0, 16), createdAt: now.toISOString(), status: 'PENDING',
      name: name, phone: phone, email: email, spaces: ids.join('|'), checkIn: b.checkIn, checkOut: b.checkOut, days: days, guests: guests,
      purpose: clean_(b.purpose, 40), idType: clean_(b.idType, 20), address: clean_(b.address, 200), notes: clean_(b.notes, 300),
      subtotal: subtotal, total: total, payNow: payNow, balance: total - payNow,
      txnid: id.replace(/-/g, '') + Math.floor(Math.random() * 90 + 10), payuId: '', payMode: '', paidAt: '', payuStatus: '', errorMsg: '',
      rulesAccepted: 'YES', emailSent: '', waSent: ''
    };
    appendRow_(rec);
  } finally { lock.releaseLock(); }

  return { ok: true, id: rec.id, token: rec.token, payNow: payNow, payu: payuParams_(rec) };
}

/* ============================ PAYU ============================ */
function payuBase_() { return P('PAYU_MODE', 'test') === 'live' ? 'https://secure.payu.in' : 'https://test.payu.in'; }

function payuParams_(r) {
  var key = P('PAYU_KEY'), salt = P('PAYU_SALT');
  if (!key || !salt) throw new Error('Payment gateway not configured (PAYU_KEY / PAYU_SALT).');
  var self = ScriptApp.getService().getUrl();
  var amount = Number(r.payNow).toFixed(2), productinfo = 'Panchanan Villa Booking';
  var firstname = String(r.name).replace(/[^A-Za-z0-9 .]/g, '').slice(0, 60) || 'Guest';
  var udf1 = r.id, udf2 = r.checkIn + '_' + r.checkOut, udf3 = r.spaces, udf4 = '', udf5 = '';
  // sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
  var hash = sha512_([key, r.txnid, amount, productinfo, firstname, r.email, udf1, udf2, udf3, udf4, udf5, '', '', '', '', '', salt].join('|'));
  return {
    action: payuBase_() + '/_payment',
    params: { key: key, txnid: r.txnid, amount: amount, productinfo: productinfo, firstname: firstname, email: r.email,
              phone: r.phone, udf1: udf1, udf2: udf2, udf3: udf3, udf4: udf4, udf5: udf5, surl: self, furl: self, hash: hash }
  };
}

function payuReturn_(p) {
  var key = P('PAYU_KEY'), salt = P('PAYU_SALT');
  // reverse hash: [additional_charges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
  var parts = [salt, p.status, '', '', '', '', '', p.udf5 || '', p.udf4 || '', p.udf3 || '', p.udf2 || '', p.udf1 || '',
               p.email, p.firstname, p.productinfo, p.amount, p.txnid, key];
  if (p.additional_charges) parts.unshift(p.additional_charges);
  var valid = sha512_(parts.join('|')) === String(p.hash).toLowerCase();
  var rec = findBy_('txnid', p.txnid);
  if (!rec) return returnPage_(null, 'Booking reference not found. Please contact us with transaction ID ' + p.txnid);

  if (rec.status !== 'PAID') {
    var amountOk = Number(p.amount).toFixed(2) === Number(rec.payNow).toFixed(2);
    if (valid && amountOk && p.status === 'success') {
      markPaid_(rec, p.mihpayid, p.mode, p.status);
    } else {
      updateRow_(rec.id, { status: p.status === 'success' ? 'PENDING' : 'FAILED', payuStatus: p.status,
        errorMsg: (!valid ? 'HASH MISMATCH ' : '') + (!amountOk ? 'AMOUNT MISMATCH ' : '') + (p.error_Message || '') });
    }
  }
  return returnPage_(findBy_('id', rec.id));
}

/** Server-to-server verification (used by status checks + 10-min trigger). */
function verifyWithPayU_(rec) {
  var key = P('PAYU_KEY'), salt = P('PAYU_SALT');
  if (!key || !salt) return rec;
  var url = (P('PAYU_MODE', 'test') === 'live' ? 'https://info.payu.in' : 'https://test.payu.in') + '/merchant/postservice?form=2';
  var res = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true, payload: {
    key: key, command: 'verify_payment', var1: rec.txnid, hash: sha512_([key, 'verify_payment', rec.txnid, salt].join('|')) } });
  try {
    var d = JSON.parse(res.getContentText()), t = d.transaction_details && d.transaction_details[rec.txnid];
    if (!t) return rec;
    if (t.status === 'success' && Number(t.amt).toFixed(2) === Number(rec.payNow).toFixed(2)) markPaid_(rec, t.mihpayid, t.mode, 'success (verified)');
    else if (t.status === 'failure' || t.status === 'dropped' || t.status === 'bounced') updateRow_(rec.id, { status: 'FAILED', payuStatus: t.status, errorMsg: t.error_Message || '' });
  } catch (e) {}
  return findBy_('id', rec.id);
}

/** Install once: Run → setupTriggers. Reconciles PENDING payments every 10 min. */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('reconcilePending').timeBased().everyMinutes(10).create();
  sheet_(); // creates the Bookings tab
}
function reconcilePending() {
  var cutoff = Date.now() - 3 * 864e5;
  allRows_().forEach(function (r) {
    if (r.status === 'PENDING' && new Date(r.createdAt).getTime() > cutoff) verifyWithPayU_(r);
    else if (r.status === 'PENDING' && new Date(r.createdAt).getTime() <= cutoff) updateRow_(r.id, { status: 'CANCELLED', errorMsg: 'Unpaid — auto-cancelled' });
  });
}

function markPaid_(rec, payuId, mode, payuStatus) {
  updateRow_(rec.id, { status: 'PAID', payuId: payuId || '', payMode: mode || '', paidAt: new Date().toISOString(), payuStatus: payuStatus || 'success', errorMsg: '' });
  var fresh = findBy_('id', rec.id);
  try { sendEmails_(fresh); updateRow_(rec.id, { emailSent: new Date().toISOString() }); } catch (e) { updateRow_(rec.id, { errorMsg: 'Email: ' + e.message }); }
  try { if (sendWhatsApp_(fresh)) updateRow_(rec.id, { waSent: new Date().toISOString() }); } catch (e) { updateRow_(rec.id, { errorMsg: 'WhatsApp: ' + e.message }); }
}

/* ============================ ACKNOWLEDGEMENT ============================ */
function ackLink_(r) { return P('SITE_URL', 'https://pvila.in') + '/success.html?id=' + encodeURIComponent(r.id) + '&t=' + r.token; }
function spaceNames_(r) { return String(r.spaces).split('|').map(function (s) { return NAMES[s] || s; }).join(', '); }
function inr_(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
function d_(iso) { return Utilities.formatDate(new Date(iso + 'T00:00:00+05:30'), 'Asia/Kolkata', 'dd MMM yyyy'); }

function ackHtml_(r) {
  var row = function (k, v) { return '<tr><td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#555;width:40%">' + k + '</td><td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">' + v + '</td></tr>'; };
  return '<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #16181d">' +
    '<div style="background:#5b1a16;color:#fff;padding:20px 24px"><div style="font-size:12px;letter-spacing:3px">ॐ PANCHANAN VILLA</div>' +
    '<div style="font-size:22px;font-family:Georgia,serif;margin-top:4px">Booking Acknowledgement — ' + r.id + '</div></div>' +
    '<div style="background:#e9f7ef;color:#16613a;padding:12px 24px;font-weight:bold">Booking CONFIRMED — payment received</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:10px 0">' +
      row('Guest', esc_(r.name) + ' · +91 ' + r.phone) + row('Email', esc_(r.email)) + row('Spaces', spaceNames_(r)) +
      row('Check-in', d_(r.checkIn) + ', 12:00 PM') + row('Check-out', d_(r.checkOut) + ', 11:00 AM') +
      row('Days · Guests', r.days + ' · ' + r.guests) + row('Purpose', esc_(r.purpose)) + row('Photo ID', esc_(r.idType) + ' for all adult guests') +
      row('Total tariff', '<b>' + inr_(r.total) + '</b>') +
      row('Paid online', inr_(r.payNow) + ' · ' + esc_(r.payMode) + ' · PayU ' + esc_(r.payuId)) +
      row('Balance at check-in', inr_(r.balance)) + row('Security deposit', inr_(SECURITY_DEPOSIT) + ' refundable, at check-in') +
      (r.notes ? row('Special requests', esc_(r.notes)) : '') +
    '</table>' +
    '<div style="padding:4px 24px 16px;font-size:13px;color:#444"><b>House rules:</b> No beef · No pork · Valid photo ID for all adults · Loudspeakers off 10 PM–6 AM · ' +
    'No drugs or gambling · Alcohol only with permission · No smoking indoors · No firecrackers · Damages adjusted from deposit.<br>' +
    '<b>Cancellation:</b> 7+ days 80% refund · 3–7 days 50% · under 72 h no refund.</div>' +
    '<div style="padding:0 24px 22px"><a href="' + ackLink_(r) + '" style="background:#16181d;color:#fff;padding:12px 20px;text-decoration:none;display:inline-block">View / Print Acknowledgement</a> ' +
    '<a href="https://wa.me/' + P('OWNER_WA', '919831635374') + '" style="background:#25d366;color:#fff;padding:12px 20px;text-decoration:none;display:inline-block">WhatsApp us</a></div>' +
    '<div style="border-top:1px solid #e5e7eb;padding:12px 24px;font-size:12px;color:#888">pvila.in · +91 98316 35374</div></div>';
}

function sendEmails_(r) {
  var owner = P('OWNER_EMAIL');
  MailApp.sendEmail({ to: r.email, subject: 'Booking Confirmed — Panchanan Villa (' + r.id + ')', htmlBody: ackHtml_(r),
                      name: 'Panchanan Villa', replyTo: owner || undefined });
  if (owner) MailApp.sendEmail({ to: owner, subject: '[NEW BOOKING] ' + r.id + ' · ' + r.name + ' · ' + d_(r.checkIn) + ' · ' + inr_(r.payNow),
                                 htmlBody: ackHtml_(r) + '<p style="font-family:Arial">Address: ' + esc_(r.address) + '</p>', name: 'pvila.in bookings', replyTo: r.email });
}

/** Optional: WhatsApp Cloud API (Meta). Requires an approved template with 5 body variables:
 *  {{1}} name, {{2}} booking id, {{3}} dates, {{4}} amount paid, {{5}} acknowledgement link */
function sendWhatsApp_(r) {
  var token = P('WA_TOKEN'), phoneId = P('WA_PHONE_ID'), tpl = P('WA_TEMPLATE');
  if (!token || !phoneId || !tpl) return false;
  var vars = [r.name, r.id, d_(r.checkIn) + ' to ' + d_(r.checkOut), inr_(r.payNow), ackLink_(r)];
  [ '91' + r.phone, P('OWNER_WA', '919831635374') ].forEach(function (to) {
    UrlFetchApp.fetch('https://graph.facebook.com/v21.0/' + phoneId + '/messages', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
      payload: JSON.stringify({ messaging_product: 'whatsapp', to: to, type: 'template', template: { name: tpl, language: { code: P('WA_LANG', 'en') },
        components: [{ type: 'body', parameters: vars.map(function (v) { return { type: 'text', text: String(v) }; }) }] } })
    });
  });
  return true;
}

function returnPage_(r, msg) {
  var url = r ? ackLink_(r) : P('SITE_URL', 'https://pvila.in');
  var ok = r && r.status === 'PAID';
  var html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_top"></head>' +
    '<body style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px;background:#f4f5f7">' +
    '<div style="max-width:460px;margin:auto;background:#fff;border:1px solid #16181d;padding:30px">' +
    '<div style="color:#5b1a16;letter-spacing:3px;font-size:12px">ॐ PANCHANAN VILLA</div>' +
    '<h2 style="font-family:Georgia,serif">' + (ok ? 'Payment successful' : (msg ? 'Notice' : 'Payment not completed')) + '</h2>' +
    '<p>' + (msg || (r ? 'Booking ' + r.id + ' — status: <b>' + r.status + '</b>' : '')) + '</p>' +
    '<a href="' + url + '" target="_top" style="display:inline-block;background:#16181d;color:#fff;padding:14px 22px;text-decoration:none;margin-top:10px">View Acknowledgement</a>' +
    '</div><script>setTimeout(function(){try{window.top.location.href=' + JSON.stringify(url) + '}catch(e){}},1200)</script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Panchanan Villa — Payment').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ============================ QUERIES ============================ */
function statusFor_(id, t) {
  var r = findBy_('id', id);
  if (!r || r.token !== t) return { ok: false, error: 'Booking not found' };
  if (r.status === 'PENDING') r = verifyWithPayU_(r);
  return { ok: true, booking: publicRow_(r) };
}
function publicRow_(r) {
  var o = {}; COLS.forEach(function (c) { o[c] = r[c]; });
  o.spaces = String(r.spaces || '').split('|').filter(String);
  ['days','guests','subtotal','total','payNow','balance'].forEach(function (k) { o[k] = Number(o[k]) || 0; });
  return o;
}
function holds_(r) {
  if (r.status === 'PAID') return true;
  return r.status === 'PENDING' && (Date.now() - new Date(r.createdAt).getTime()) < PENDING_HOLD_MIN * 60000;
}
function expand_(ids) { return ids.indexOf('ALL') > -1 ? ['GF','F1','F2','RT'] : ids; }
function clash_(ids, ci, co, phone) {
  var want = expand_(ids);
  return allRows_().some(function (r) {
    if (r.status === 'PENDING' && phone && r.phone === phone) return false;   // guest retrying own payment
    if (!holds_(r) || !(ci < r.checkOut && r.checkIn < co)) return false;
    var have = expand_(String(r.spaces).split('|'));
    return want.some(function (x) { return have.indexOf(x) > -1; });
  });
}
/** Booked ranges for the availability calendar — no personal data. */
function calendarItems_(from, to) {
  if (!isoDate_(from) || !isoDate_(to)) return [];
  return allRows_().filter(function (r) { return holds_(r) && r.checkIn < to && from < r.checkOut; })
    .map(function (r) { return { checkIn: r.checkIn, checkOut: r.checkOut, spaces: String(r.spaces).split('|') }; });
}
function busyMap_(from, to) {
  var out = { GF: false, F1: false, F2: false, RT: false };
  if (!isoDate_(from) || !isoDate_(to)) return out;
  allRows_().forEach(function (r) {
    if (holds_(r) && from < r.checkOut && r.checkIn < to) expand_(String(r.spaces).split('|')).forEach(function (s) { out[s] = true; });
  });
  return out;
}

/* ============================ SHEET (DATABASE) ============================ */
function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold').setBackground('#16181d').setFontColor('#ffffff');
    sh.getRange(1, 1, 1000, COLS.length).setNumberFormat('@');   // keep dates/phones as text
    sh.setFrozenRows(1);
  }
  return sh;
}
function allRows_() {
  var v = sheet_().getDataRange().getDisplayValues(); v.shift();
  return v.filter(function (r) { return r[0]; }).map(function (r) { var o = {}; COLS.forEach(function (c, i) { o[c] = r[i]; }); return o; });
}
function findBy_(col, val) { var x = allRows_().filter(function (r) { return r[col] === String(val); }); return x.length ? x[0] : null; }
function appendRow_(rec) { sheet_().appendRow(COLS.map(function (c) { return rec[c] == null ? '' : String(rec[c]); })); }
function updateRow_(id, patch) {
  var sh = sheet_(), ids = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === id) {
    Object.keys(patch).forEach(function (k) { var c = COLS.indexOf(k); if (c > -1) sh.getRange(i + 2, c + 1).setValue(String(patch[k])); });
    return;
  }
}
function csvOut_() {
  var v = sheet_().getDataRange().getDisplayValues();
  var tokenCol = COLS.indexOf('token');
  var csv = v.map(function (r) { return r.filter(function (_, i) { return i !== tokenCol; }).map(function (c) {
    c = String(c); if (/^[=+\-@]/.test(c)) c = "'" + c; return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
  return ContentService.createTextOutput('﻿' + csv).setMimeType(ContentService.MimeType.CSV)
    .downloadAsFile('pvila-bookings-' + todayIST_() + '.csv');
}

/* ============================ UTILS ============================ */
function requireAdmin_(k) { var a = P('ADMIN_KEY'); if (!a || k !== a) throw new Error('Access denied'); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sha512_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_512, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function clean_(s, n) { return String(s == null ? '' : s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function isoDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function todayIST_() { return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'); }

/* ============================ SETUP CHECK ============================
 * Run → checkSetup : lists which settings are present (never prints the Salt)
 * and signs a sample PayU request to confirm hashing works.               */
function checkSetup() {
  var need = ['PAYU_KEY','PAYU_SALT','PAYU_MODE','ADMIN_KEY','OWNER_EMAIL','SITE_URL','OWNER_WA'];
  need.forEach(function (k) {
    var v = P(k);
    Logger.log('%s : %s', k, !v ? 'MISSING' : (k === 'PAYU_SALT' || k === 'ADMIN_KEY') ? 'set (' + v.length + ' chars)' : v);
  });
  if (P('PAYU_KEY') && P('PAYU_SALT')) {
    var p = payuParams_({ txnid: 'TEST' + Date.now(), payNow: 1, name: 'Test', email: 'test@example.com', phone: '9999999999',
                          id: 'PV-TEST', checkIn: '2026-01-01', checkOut: '2026-01-02', spaces: 'GF' });
    Logger.log('PayU endpoint: %s  · sample hash OK (%s chars)', p.action, p.params.hash.length);
  }
}
