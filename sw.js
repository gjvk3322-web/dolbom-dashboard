// 돌봄매트 스케줄러 서비스워커 (2026-09-29)
// 역할: 바뀌지 않는 정적 파일(Firebase SDK·구글 폰트·앱 아이콘·manifest)만 캐시해서 앱이 즉시 뜨게 함.
// 그 외(scheduler*.html, guide.js, iolog.js, ioadmin.js, auth.js, 구글시트 CSV, Firebase, Apps Script, 지오코딩)는
// 이 워커가 전혀 건드리지 않고 브라우저가 평소처럼 네트워크로 받음 → 실시간 예약·배정 반영에 영향 없음.
const CACHE = 'dolbom-static-v1';

function cacheable(url) {
  const u = new URL(url);
  if (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/')) return true;
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') return true;
  if (u.origin === self.location.origin) {
    if (/\.(png|ico|webp|woff2?)$/i.test(u.pathname)) return true;
    if (u.pathname.endsWith('/manifest.json')) return true;
  }
  return false;
}

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !cacheable(req.url)) return; // 나머지는 워커가 관여하지 않음
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => fetch(req))
  );
});
