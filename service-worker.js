
const CACHE = "fleeman-fitness-v78";
const CORE_ASSETS = ["./", "./index.html", "./styles.css?v=78", "./exercise-library.js?v=75", "./bodyweight-exercises.js?v=75", "./workout-classifier.js?v=75", "./schedule-utils.js?v=75", "./active-workout-utils.js?v=75", "./program-templates.js?v=75", "./starting-weight-rules.js?v=75", "./validation.js?v=75", "./hybrid-config.js?v=75", "./progression-reasons.js?v=78", "./hybrid-stress.js?v=78", "./hybrid-strength-adapter.js?v=78", "./hybrid-progression.js?v=78", "./hybrid-recovery.js?v=75", "./hybrid-scheduler.js?v=78", "./app.js?v=78", "./live-workout.js?v=78", "./mesocycles.js?v=75", "./rolling-cycles.js?v=75", "./builder-reliability.js?v=75", "./fitness-enhancements.js?v=75", "./build-modes.js?v=75", "./hybrid-ui.js?v=78"];
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
