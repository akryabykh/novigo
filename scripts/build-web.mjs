import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['expo', 'export', '--platform', 'web'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);

const dist = join(process.cwd(), 'dist');
copyFileSync(join(process.cwd(), 'assets/images/icon.png'), join(dist, 'novigo-icon.png'));
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify({
  name: 'Novigo', short_name: 'Novigo', start_url: '/', scope: '/', display: 'standalone',
  background_color: '#ffffff', theme_color: '#208AEF',
  icons: [{ src: '/novigo-icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
}));

const indexPath = join(dist, 'index.html');
const html = readFileSync(indexPath, 'utf8')
  .replace('</head>', '<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/novigo-icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Novigo"></head>')
  .replace('</body>', '<script>window.addEventListener("load", () => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); });</script></body>');
writeFileSync(indexPath, html);

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
const urls = files(dist).filter((path) => !path.endsWith('/sw.js'))
  .map((path) => `/${relative(dist, path).split('\\').join('/')}`);
const revision = createHash('sha256').update(JSON.stringify(urls.map((url) => [url, createHash('sha256').update(readFileSync(join(dist, url.slice(1)))).digest('hex')]))).digest('hex').slice(0, 12);
writeFileSync(join(dist, 'sw.js'), `
const CACHE = 'novigo-${revision}';
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('novigo-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/supabase-api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put('/index.html', copy)); }
      return response;
    }).catch(() => caches.match('/index.html')));
  } else {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});
`);
