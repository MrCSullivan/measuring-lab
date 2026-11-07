/*
  Measuring Lab service worker.

  Keeps a copy of the game on the iPad so it opens straight away, even when the
  school wifi is slow. The page itself and config.js are fetched fresh first
  (so updates arrive), and the saved copy is used if that takes too long or
  fails. Fonts and icons come from the saved copy. Requests to the Google
  sheet are never touched: scores always go straight to the sheet.

  Change the version below whenever index.html changes, so iPads drop the old copy.
*/
var CACHE = "measuring-lab-v36";
var FILES = [
  "./", "index.html", "config.js", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png",
  "fonts.css", "karla-latin-400-normal.woff2", "karla-latin-600-normal.woff2",
  "karla-latin-700-normal.woff2", "fraunces-latin-opsz-normal.woff2"
];

self.addEventListener("install", function (e) {
  // Each file is saved on its own, so one missing file never stops the update.
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () { /* skip it */ }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // the Google sheet and anything else outside: leave alone

  var fresh = req.mode === "navigate" || /(\/|index\.html|config\.js)$/.test(url.pathname);
  if (fresh) {
    // Try the network for up to 4 seconds, then fall back to the saved copy.
    e.respondWith(new Promise(function (resolve) {
      var done = false;
      var fallback = function () {
        if (done) return;
        caches.match(req, { ignoreSearch: true }).then(function (hit) {
          if (hit && !done) { done = true; resolve(hit); }
          else if (!hit && req.mode === "navigate") caches.match("index.html").then(function (h) { if (h && !done) { done = true; resolve(h); } });
        });
      };
      var timer = setTimeout(fallback, 4000);
      fetch(req).then(function (res) {
        clearTimeout(timer);
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        if (!done) { done = true; resolve(res); }
      }).catch(function () { clearTimeout(timer); fallback(); });
    }));
    return;
  }

  // Fonts, icons and the rest: saved copy first, network if it isn't saved yet.
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
