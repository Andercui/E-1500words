/* 1500词 · Service Worker（缓存优先；仅同源） */
const CACHE = 'kaoyan1500-4a3144edf2e3';
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

  /* 页面导航（打开 / 刷新）单独处理：**网络优先，最多等 1.2s**，超时或离线才用缓存。
     原因：纯缓存优先会让用户长期停留在旧 HTML —— 代码改了却「看不到效果」，
     而且不点更新提示条就永远不刷新。其余同源静态资源仍然缓存优先（秒开）。 */
  var nav = (e.request.mode === 'navigate') || (function (u) {
    try { var p = new URL(u).pathname; return p.slice(-1) === '/' || /\/index\.html$/.test(p); }
    catch (x) { return false; }
  })(e.request.url);
  if (nav) {
    e.respondWith((function () {
      var cacheP = caches.match('./index.html');
      var netP = fetch(e.request, { cache: 'no-store' }).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        }
        return res;
      }).catch(function () { return null; });
      var timeout = new Promise(function (r) { setTimeout(function () { r('timeout'); }, 1200); });
      return Promise.race([netP, timeout]).then(function (res) {
        if (res && res !== 'timeout') return res;
        return cacheP.then(function (hit) { return hit || netP; });
      }).catch(function () {
        return cacheP.then(function (hit) { return hit || Response.error(); });
      });
    })());
    return;
  }

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
        return Response.error();
      });
    })
  );
});
