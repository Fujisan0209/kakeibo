/* Service Worker：アプリ本体をキャッシュしてオフラインでも動かす。
 * ファイルを変えたら VERSION を上げること（古いキャッシュが消え、更新が配信される）。 */
const VERSION = 'kakeibo-v1.0.1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/util.js', './js/idb.js', './js/store.js', './js/calc.js', './js/receipts.js', './js/io.js', './js/charts.js', './js/ui.js',
  './js/views/home.js', './js/views/input.js', './js/views/list.js', './js/views/budget.js', './js/views/accounts.js',
  './js/views/analysis.js', './js/views/plans.js', './js/views/settings.js', './js/views/misc.js', './js/app.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  // HTTP キャッシュに残った古いファイルを拾わないよう、必ずネットワークから取る
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

// 画面の「更新する」ボタンから呼ばれる
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('kakeibo-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// キャッシュ優先（オフラインでも即表示）。裏でネットワークから取り直してキャッシュを更新する
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { e.waitUntil(network); return cached; }
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return new Response('', { status: 504, statusText: 'offline' });
    })
  );
});

// 通知をタップしたらアプリを開く
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./index.html#/home');
  }));
});
