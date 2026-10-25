/* 共通ユーティリティ：エスケープ、金額表示、日付、ハッシュ、CSV */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});

  // ---- HTML エスケープ（表示する文字列は必ずこれを通す）----
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  function h(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"'`]/g, (c) => ESC[c]);
  }

  // 色はユーザー入力になりうるので、#rrggbb 形式以外は既定色にする
  function safeColor(c, fallback) {
    return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : fallback || '#8a8f98';
  }

  // ---- 金額（整数・円）----
  const nf = new Intl.NumberFormat('ja-JP');
  function fmt(n) {
    return nf.format(Math.trunc(n || 0));
  }
  function yen(n) {
    n = Math.trunc(n || 0);
    return (n < 0 ? '−¥' : '¥') + nf.format(Math.abs(n));
  }
  // 符号付き（収支の差など）
  function yenSigned(n) {
    n = Math.trunc(n || 0);
    if (n === 0) return '¥0';
    return (n > 0 ? '+¥' : '−¥') + nf.format(Math.abs(n));
  }
  // 入力文字列 → 整数円。全角数字・カンマ・¥ を許容。不正なら NaN
  function parseYen(s) {
    if (typeof s === 'number') return Number.isFinite(s) ? Math.round(s) : NaN;
    if (s === null || s === undefined) return NaN;
    let t = String(s)
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[－−ー]/g, '-')
      .replace(/[,，¥￥円\s]/g, '');
    if (t === '' || !/^-?\d+(\.\d+)?$/.test(t)) return NaN;
    const v = Math.round(Number(t));
    return Number.isSafeInteger(v) ? v : NaN;
  }

  // ---- 日付（すべてローカル時刻の 'YYYY-MM-DD' / 'YYYY-MM' 文字列で扱う）----
  const pad = (n) => String(n).padStart(2, '0');
  function dateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function today() {
    return dateStr(new Date());
  }
  function monthOf(ds) {
    return ds.slice(0, 7);
  }
  function thisMonth() {
    return today().slice(0, 7);
  }
  function parseYM(ym) {
    const [y, m] = ym.split('-').map(Number);
    return { y, m };
  }
  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate(); // m は 1-12
  }
  function addMonths(ym, n) {
    const { y, m } = parseYM(ym);
    const idx = y * 12 + (m - 1) + n;
    return Math.floor(idx / 12) + '-' + pad((idx % 12) + 1);
  }
  function monthDiff(a, b) {
    // b - a（月数）
    const A = parseYM(a), B = parseYM(b);
    return (B.y - A.y) * 12 + (B.m - A.m);
  }
  // 月の day 日（月の日数を超える場合は月末に丸める）
  function dayInMonth(ym, day) {
    const { y, m } = parseYM(ym);
    return ym + '-' + pad(Math.min(Math.max(1, day), daysInMonth(y, m)));
  }
  function addDays(ds, n) {
    const [y, m, d] = ds.split('-').map(Number);
    return dateStr(new Date(y, m - 1, d + n));
  }
  function dayDiff(a, b) {
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  }
  function isValidDate(ds) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds || '')) return false;
    const [y, m, d] = ds.split('-').map(Number);
    return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
  }
  // 'YYYY/M/D' などを 'YYYY-MM-DD' に正規化。不正なら null
  function normDate(s) {
    const mt = String(s || '').trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
    if (!mt) return null;
    const ds = mt[1] + '-' + pad(+mt[2]) + '-' + pad(+mt[3]);
    return isValidDate(ds) ? ds : null;
  }
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  function weekday(ds) {
    const [y, m, d] = ds.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  }
  function fmtDate(ds, withYear) {
    const [y, m, d] = ds.split('-').map(Number);
    return (withYear ? y + '年' : '') + m + '月' + d + '日（' + WD[weekday(ds)] + '）';
  }
  function fmtMonth(ym) {
    const { y, m } = parseYM(ym);
    return y + '年' + m + '月';
  }

  // ---- ID ----
  function uid(prefix) {
    const r = (crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(2)) : [Math.random() * 4e9, Math.random() * 4e9];
    return (prefix || '') + Date.now().toString(36) + (r[0] >>> 0).toString(36) + (r[1] >>> 0).toString(36).slice(0, 4);
  }

  // ---- SHA-256（純 JS。file:// や非 secure context でも動くように）----
  function sha256(str) {
    const bytes = new TextEncoder().encode(str);
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const l = bytes.length;
    const n = (((l + 9) >> 6) + 1) << 6;
    const buf = new Uint8Array(n);
    buf.set(bytes);
    buf[l] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(n - 8, Math.floor((l * 8) / 0x100000000));
    dv.setUint32(n - 4, (l * 8) >>> 0);
    const W = new Uint32Array(64);
    const rotr = (x, r) => (x >>> r) | (x << (32 - r));
    for (let off = 0; off < n; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + K[i] + W[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += hh;
    }
    return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
  }
  // パスコード用：ソルト付きで繰り返しハッシュ（総当たりを少しだけ遅くする）
  function hashPasscode(code, salt) {
    let x = salt + ':' + code;
    for (let i = 0; i < 2000; i++) x = sha256(x + salt);
    return x;
  }

  // ---- CSV ----
  function csvCell(v) {
    let s = v === null || v === undefined ? '' : String(v);
    // Excel の数式インジェクション対策
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+$/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows) {
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = [];
    let row = [], cell = '', i = 0, q = false;
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        cell += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ',') { row.push(cell); cell = ''; i++; continue; }
      if (c === '\r' || c === '\n') {
        row.push(cell); cell = '';
        rows.push(row); row = [];
        if (c === '\r' && text[i + 1] === '\n') i++;
        i++; continue;
      }
      cell += c; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }

  // タグ文字列 "#旅行 #沖縄, 出張" → ['旅行','沖縄','出張']
  function parseTags(s) {
    const out = [];
    String(s || '')
      .split(/[\s,、，　]+/)
      .map((t) => t.replace(/^[#＃]+/, '').trim())
      .filter(Boolean)
      .forEach((t) => { t = t.slice(0, 30); if (!out.includes(t)) out.push(t); });
    return out.slice(0, 20);
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      const a = arguments;
      t = setTimeout(() => fn.apply(this, a), ms);
    };
  }

  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  KB.util = {
    h, safeColor, fmt, yen, yenSigned, parseYen,
    pad, dateStr, today, thisMonth, monthOf, parseYM, daysInMonth, addMonths, monthDiff, dayInMonth, addDays, dayDiff,
    isValidDate, normDate, weekday, WD, fmtDate, fmtMonth,
    uid, sha256, hashPasscode, toCSV, parseCSV, parseTags, debounce, download, clamp,
  };
})();
