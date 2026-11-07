/*
  Keeps the game available when the connection is poor.

  The page and its few files are stored on the device the first time they load.
  After that the page is fetched fresh when the network answers within a few
  seconds, and taken from the device when it does not, so a slow or flaky school
  connection no longer means a page that will not open. Anything that is not on
  this website (the class sheet) goes straight to the network and is never
  stored or answered from here, so scores are never served stale.
*/
var CACHE = "measuring-lab-v31";
var SHELL = ["./", "index.html", "config.js", "manifest.webmanifest",
             "apple-touch-icon.png", "icon-192.png", "icon-512.png",
             "fonts/fonts.css", "fonts/karla-latin-400-normal.woff2", "fonts/karla-latin-600-normal.woff2",
             "fonts/karla-latin-700-normal.woff2", "fonts/fraunces-latin-opsz-normal.woff2"];
var WAIT_PAGE = 3000;     // how long to wait for the network before using the stored page
var WAIT_CONFIG = 2500;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(SHELL.map(function (u) { return cache.add(u).catch(function () { return null; }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                             .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// One stored copy per page, whatever is on the end of the address (?class=...).
function keyFor(url) { return new Request(url.origin + url.pathname); }

function freshOrStored(req, url, wait) {
  var key = keyFor(url);
  return caches.open(CACHE).then(function (cache) {
    var network = fetch(req).then(function (res) {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    });
    var gaveUp = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, wait); });
    return Promise.race([network.catch(function () { return null; }), gaveUp]).then(function (res) {
      if (res) return res;
      return cache.match(key).then(function (hit) { return hit || network; });
    });
  });
}

function storedFirst(req, url) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(keyFor(url)).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) cache.put(keyFor(url), res.clone());
        return res;
      });
    });
  });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var page = req.mode === "navigate" || /\/(index\.html)?$/.test(url.pathname);
  if (page) { event.respondWith(freshOrStored(req, url, WAIT_PAGE)); return; }
  if (/config\.js$/.test(url.pathname)) { event.respondWith(freshOrStored(req, url, WAIT_CONFIG)); return; }
  event.respondWith(storedFirst(req, url));
});
