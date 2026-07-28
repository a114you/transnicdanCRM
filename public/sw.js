const SW_VERSION = "autoservice-crm-v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" }).catch(() => {
      return new Response("Offline", {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Service-Worker": SW_VERSION,
        },
      });
    })
  );
});
