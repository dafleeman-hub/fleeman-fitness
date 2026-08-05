
const CACHE = "fleeman-fitness-v44";
const CORE_ASSETS = ["./", "./index.html", "./styles.css", "./exercise-library.js", "./program-templates.js", "./starting-weight-rules.js", "./validation.js", "./app.js", "./live-workout.js", "./mesocycles.js", "./rolling-cycles.js"];
const OPTIONAL_ASSETS = ["./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", event => event.waitUntil(
  caches.open(CACHE).then(async cache => {
    await cache.addAll(CORE_ASSETS);
    await Promise.all(OPTIONAL_ASSETS.map(async asset => {
      try {
        const response = await fetch(asset);
        if (response.ok) await cache.put(asset, response);
      } catch {
        // Optional install assets should not prevent the core workout app from caching.
      }
    }));
  })
));
self.addEventListener("activate", event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", event => {
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
