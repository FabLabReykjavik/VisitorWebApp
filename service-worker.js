// service-worker.js
//
// Offline application shell for the visitor logger.
// Google Apps Script requests are deliberately never intercepted or cached.

const CACHE_PREFIX = "visitor-app-";
const CACHE = `${CACHE_PREFIX}v11`;

// Resolve assets relative to the service-worker scope. This works both at a
// domain root and when the logger is hosted inside a project subdirectory.
const APP_ROOT = new URL("./", self.location.href);

const REQUIRED_ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/styles.css",
  "js/config.js",
  "js/app.js",
  "js/api.js",
  "js/db.js",
  "js/charts.js",
  "vendor/chart.umd.js",
  "vendor/chartjs-plugin-datalabels.min.js",
  "vendor/idb-keyval.js",
  "assets/logo_small.png",
  "assets/Google_Sheets_logo.svg"
];

function scopedUrl(path) {
  return new URL(path, APP_ROOT).href;
}

async function fetchFresh(url) {
  const response = await fetch(url, {
    cache: "reload"
  });

  if (!response.ok) {
    throw new Error(
      `Could not cache ${url}: HTTP ${response.status}`
    );
  }

  return response;
}

async function cacheRequiredAssets(cache) {
  // A missing required file prevents activation of an incomplete offline app.
  await Promise.all(
    REQUIRED_ASSETS.map(async path => {
      const url = scopedUrl(path);
      const response = await fetchFresh(url);

      await cache.put(url, response);
    })
  );
}

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);

      await cacheRequiredAssets(cache);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(key => {
            return (
              key.startsWith(CACHE_PREFIX) &&
              key !== CACHE
            );
          })
          .map(key => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

async function cachedMatch(request) {
  return caches.match(request, {
    ignoreSearch: true
  });
}

function canCache(response) {
  return Boolean(
    response &&
    response.ok &&
    (
      response.type === "basic" ||
      response.type === "default"
    )
  );
}

async function networkFirst(
  request,
  fallbackUrl = null
) {
  try {
    const response = await fetch(request);

    if (canCache(response)) {
      const cache = await caches.open(CACHE);

      await cache.put(
        request,
        response.clone()
      );
    }

    return response;
  } catch (error) {
    const cached = await cachedMatch(request);

    if (cached) {
      return cached;
    }

    if (fallbackUrl) {
      const fallback =
        await cachedMatch(fallbackUrl);

      if (fallback) {
        return fallback;
      }
    }

    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cached = await cachedMatch(request);

  const update = fetch(request)
    .then(async response => {
      if (canCache(response)) {
        const cache = await caches.open(CACHE);

        await cache.put(
          request,
          response.clone()
        );
      }

      return response;
    });

  if (cached) {
    // Prevent a failed background refresh becoming an unhandled promise.
    update.catch(() => {});

    return cached;
  }

  return update;
}

self.addEventListener("fetch", event => {
  const request = event.request;

  // Visit uploads use POST. Apps Script is cross-origin. Neither should be
  // handled by the application-shell cache.
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(
        request,
        scopedUrl("index.html")
      )
    );

    return;
  }

  const isFrequentlyUpdatedCode =
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".mjs") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".json");

  if (isFrequentlyUpdatedCode) {
    // Fetch new deployments immediately, with the installed cache as the
    // offline fallback.
    event.respondWith(
      networkFirst(request)
    );

    return;
  }

  // Images and static local assets display from cache while refreshing.
  event.respondWith(
    staleWhileRevalidate(request)
  );
});