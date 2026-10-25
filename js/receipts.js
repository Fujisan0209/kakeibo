/* レシート画像：縮小・JPEG 圧縮して IndexedDB に保存 */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const MAX_SIDE = 1280;
  const QUALITY = 0.7;
  const urls = {}; // id -> objectURL

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
      img.src = url;
    });
  }

  // 長辺 MAX_SIDE px に縮小して JPEG Blob にする
  async function compress(file) {
    if (!/^image\//.test(file.type)) throw new Error('画像ファイルを選んでください');
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const hgt = Math.max(1, Math.round(img.naturalHeight * scale));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = hgt;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, hgt);
    ctx.drawImage(img, 0, 0, w, hgt);
    return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を圧縮できませんでした'))), 'image/jpeg', QUALITY));
  }

  async function save(file) {
    const blob = await compress(file);
    const id = KB.util.uid('r_');
    await KB.idb.put('receipts', id, blob);
    return { id, size: blob.size };
  }
  async function url(id) {
    if (!id) return null;
    if (urls[id]) return urls[id];
    const b = await KB.idb.get('receipts', id).catch(() => null);
    if (!b) return null;
    return (urls[id] = URL.createObjectURL(b));
  }
  async function remove(id) {
    if (!id) return;
    if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; }
    await KB.idb.del('receipts', id).catch(() => {});
  }
  // どの取引からも参照されていない画像を消す（起動時に実行。Undo の取り消しは再起動で消える）
  async function gc() {
    const used = new Set(KB.store.state.transactions.map((t) => t.receiptId).filter(Boolean));
    const keys = await KB.idb.keys('receipts').catch(() => []);
    let n = 0;
    for (const k of keys) if (!used.has(k)) { await remove(k); n++; }
    return n;
  }
  function blobToDataURL(b) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(b);
    });
  }
  async function exportAll() {
    const out = {};
    const used = new Set(KB.store.state.transactions.map((t) => t.receiptId).filter(Boolean));
    for (const id of used) {
      const b = await KB.idb.get('receipts', id).catch(() => null);
      if (b) out[id] = await blobToDataURL(b);
    }
    return out;
  }
  async function importAll(map) {
    let n = 0;
    for (const id of Object.keys(map || {})) {
      const d = map[id];
      if (typeof d !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(d)) continue;
      const b = await (await fetch(d)).blob();
      await KB.idb.put('receipts', id, b);
      n++;
    }
    return n;
  }

  KB.receipts = { compress, save, url, remove, gc, exportAll, importAll };
})();
