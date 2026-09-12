
const CACHE = "fleeman-fitness-v73";
const CORE_ASSETS = ["./", "./index.html", "./styles.css?v=73", "./exercise-library.js?v=73", "./bodyweight-exercises.js?v=73", "./workout-classifier.js?v=73", "./schedule-utils.js?v=73", "./active-workout-utils.js?v=73", "./program-templates.js?v=73", "./starting-weight-rules.js?v=73", "./validation.js?v=73", "./hybrid-config.js?v=73", "./hybrid-stress.js?v=73", "./hybrid-progression.js?v=73", "./hybrid-recovery.js?v=73", "./hybrid-scheduler.js?v=73", "./app.js?v=73", "./live-workout.js?v=73", "./mesocycles.js?v=73", "./rolling-cycles.js?v=73", "./builder-reliability.js?v=73", "./fitness-enhancements.js?v=73", "./build-modes.js?v=73", "./hybrid-ui.js?v=73"];
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
