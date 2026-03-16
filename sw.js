const CACHE='dolbom-v1';
const URLS=['./app.html','./manifest.json'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>
    Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  // 네트워크 우선, 실패시 캐시
  e.respondWith(
    fetch(e.request).then(r=>{
      const c=r.clone();
      caches.open(CACHE).then(cache=>cache.put(e.request,c));
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
