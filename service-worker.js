
const CACHE = "fleeman-fitness-v70";
const CORE_ASSETS = ["./", "./index.html", "./styles.css?v=70", "./exercise-library.js?v=70", "./bodyweight-exercises.js?v=70", "./workout-classifier.js?v=70", "./schedule-utils.js?v=70", "./active-workout-utils.js?v=70", "./program-templates.js?v=70", "./starting-weight-rules.js?v=70", "./validation.js?v=70", "./app.js?v=70", "./live-workout.js?v=70", "./mesocycles.js?v=70", "./rolling-cycles.js?v=70", "./builder-reliability.js?v=70", "./fitness-enhancements.js?v=70"];
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
