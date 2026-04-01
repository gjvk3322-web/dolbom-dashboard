const CACHE='dolbom-v26';
const URLS=['./app.html','./manifest.json','./scheduler.html','./scheduler-gg.html'];

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
  if(!e.request.url.startsWith('http'))return;
  e.respondWith(
    fetch(e.request).then(r=>{
      if(r.ok){const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c))}
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
