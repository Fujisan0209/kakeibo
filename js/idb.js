/* IndexedDB の小さなラッパー（レシート画像と、localStorage に入りきらないときの本体データ用） */
(function () {
  'use strict';
  const KB = (window.KB = window.KB || {});
  const DB_NAME = 'kakeibo';
  const DB_VER = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB が使えません'));
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('receipts')) db.createObjectStore('receipts');
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB を開けません'));
      req.onblocked = () => reject(new Error('IndexedDB がほかのタブで使用中です'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      const r = fn(s);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('中断されました'));
    }));
  }

  KB.idb = {
    available: () => open().then(() => true, () => false),
    get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
    put: (store, key, val) => tx(store, 'readwrite', (s) => s.put(val, key)),
    del: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
    keys: (store) => tx(store, 'readonly', (s) => s.getAllKeys()),
    clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
  };
})();
