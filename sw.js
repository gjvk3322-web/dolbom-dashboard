const CACHE='dolbom-v2';
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
  // http/https만 캐시 (chrome-extension 등 제외)
  if(!e.request.url.startsWith('http'))return;
  // 네트워크 우선, 실패시 캐시
  e.respondWith(
    fetch(e.request).then(r=>{
      if(r.ok){const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c))}
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
