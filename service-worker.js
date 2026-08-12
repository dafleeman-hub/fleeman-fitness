
const CACHE = "fleeman-fitness-v62";
const CORE_ASSETS = ["./", "./index.html", "./styles.css?v=62", "./exercise-library.js?v=62", "./bodyweight-exercises.js?v=62", "./program-templates.js?v=62", "./starting-weight-rules.js?v=62", "./validation.js?v=62", "./app.js?v=62", "./live-workout.js?v=62", "./mesocycles.js?v=62", "./rolling-cycles.js?v=62", "./builder-reliability.js?v=62", "./fitness-enhancements.js?v=62"];
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
