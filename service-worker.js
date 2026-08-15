
const CACHE = "fleeman-fitness-v63";
const CORE_ASSETS = ["./", "./index.html", "./styles.css?v=63", "./exercise-library.js?v=63", "./bodyweight-exercises.js?v=63", "./workout-classifier.js?v=63", "./schedule-utils.js?v=63", "./program-templates.js?v=63", "./starting-weight-rules.js?v=63", "./validation.js?v=63", "./app.js?v=63", "./live-workout.js?v=63", "./mesocycles.js?v=63", "./rolling-cycles.js?v=63", "./builder-reliability.js?v=63", "./fitness-enhancements.js?v=63"];
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
