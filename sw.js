// Somewhere After Rain — service worker
// เป้าหมาย: เปิดแอปได้แม้ไม่มีสัญญาณ (ในอุทยานส่วนใหญ่เน็ตใช้ไม่ได้)
// กลยุทธ์: network-first + cache fallback
//   - ออนไลน์  → โหลดจากเน็ตเสมอ ได้ของใหม่ทุกครั้ง แล้วอัปเดตแคชเงียบๆ
//   - ออฟไลน์  → หยิบจากแคชมาเสิร์ฟแทน
// เลือกแบบนี้เพราะไม่ต้องคอยขยับเลขเวอร์ชันในไฟล์นี้ทุกครั้งที่อัปโค้ด

const CACHE = 'sar-cache-v1';

// ไฟล์แกนที่ต้องมีถึงจะเปิดแอปได้
const CORE = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './logo.webp',
  './manifest.json',
];

self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE)
      // ไฟล์ไหนโหลดไม่ได้ก็ข้ามไป อย่าให้การติดตั้งล้มทั้งชุด
      .then(cache=> Promise.allSettled(CORE.map(url=> cache.add(url))))
      .then(()=> self.skipWaiting())
  );
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys()
      .then(keys=> Promise.all(keys.filter(k=> k !== CACHE).map(k=> caches.delete(k))))
      .then(()=> self.clients.claim())
  );
});

self.addEventListener('fetch', (event)=>{
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);

  // ปล่อยผ่านทุกอย่างที่ไม่ใช่ไฟล์ของเราเอง
  // (Supabase, Nominatim, OSRM, Google Fonts) — พวกนี้ต้องเป็นข้อมูลสดเท่านั้น
  if(url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res=>{
        if(res && res.ok){
          const copy = res.clone();
          caches.open(CACHE).then(c=> c.put(req, copy)).catch(()=>{});
        }
        return res;
      })
      .catch(async ()=>{
        // ไม่มีเน็ต: หาในแคช โดยไม่สนพารามิเตอร์ ?v=... ที่ใช้ล้างแคชเบราว์เซอร์
        const hit = await caches.match(req, {ignoreSearch:true});
        if(hit) return hit;
        // ถ้าเป็นการเปิดหน้าเว็บตรงๆ ให้ย้อนกลับไปหน้าแรกที่แคชไว้
        if(req.mode === 'navigate'){
          const shell = await caches.match('./index.html', {ignoreSearch:true});
          if(shell) return shell;
        }
        return new Response('ออฟไลน์อยู่ และยังไม่มีไฟล์นี้ในเครื่อง', {
          status: 503,
          headers: {'Content-Type':'text/plain; charset=utf-8'}
        });
      })
  );
});
