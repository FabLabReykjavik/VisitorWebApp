// service-worker.js
const CACHE = "visitor-app-v6";
const ASSETS = [
  "/", "/index.html",
  "/dashboard.html",
  "/css/styles.css",
  "/js/app.js", "/js/api.js", "/js/db.js", "/js/charts.js",
  "/vendor/chart.umd.js", "/vendor/chartjs-plugin-datalabels.min.js",
  "/vendor/plotly.min.js", "/vendor/idb-keyval.js",
  "/assets/logo_small.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Only cache same-origin navigations/assets. Let cross-origin (Apps Script) pass-through.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) return; // do NOT intercept Apps Script calls

  // Network-first for HTML navigations, cache-first for static assets
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/index.html")));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request))
  );
});
