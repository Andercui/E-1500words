/* 1500词 · Service Worker（缓存优先；仅同源） */
const CACHE = 'kaoyan1500-3b00df664ab3';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

function sameOrigin(u) {
  try { return new URL(u).origin === self.location.origin; } catch (e) { return false; }
}

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () {
      /* 清掉历史版本误存的跨域条目（例如 api.github.com 的旧响应） */
      return caches.open(CACHE).then(function (c) {
        return c.keys().then(function (reqs) {
          return Promise.all(reqs.filter(function (r) { return !sameOrigin(r.url); })
            .map(function (r) { return c.delete(r); }));
        });
      });
    }).then(function () { return self.clients.claim(); })
  );
});

/* 缓存优先：有缓存直接返回（离线可用、秒开）；无缓存才联网并写入缓存。
   跨域请求（api.github.com 等云同步接口）一律不拦截、不缓存，直接走网络。 */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;          /* PUT 等直接走网络 */
  if (!sameOrigin(e.request.url)) return;          /* 跨域直接走网络 */
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
