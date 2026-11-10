/* ==========================================================================
   sw.js — service worker do Aura Health Journal
   --------------------------------------------------------------------------
   Estratégias:
     · shell (HTML/CSS/JS/ícones)  → cache-first com revalidação em fundo;
       a app abre sem ligação e a versão nova é servida no arranque seguinte.
     · navegações                 → rede primeiro, recurso ao index.html em cache.
     · Open-Meteo                 → rede primeiro, guarda a última resposta boa
       para que o barómetro e os relatórios mostrem dados quando está offline.
   Os dados de saúde vivem em IndexedDB e não passam nunca por aqui.
   ========================================================================== */

const VERSAO = 'aura-v22';
const CACHE_SHELL = `${VERSAO}-shell`;
const CACHE_DADOS = `${VERSAO}-dados`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'styles/app.css',
  'styles/print.css',
  'assets/icons/icon-192.png',
  'assets/icons/icon-384.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'js/app.js',
  'js/store.js',
  'js/utils.js',
  'js/nav.js',
  'js/weather.js',
  'js/clima.js',
  'js/charts.js',
  'js/seed.js',
  'js/health-import.js',
  'js/alimentos.js',
  'js/alimentos-comuns.js',
  'js/nutricao.js',
  'js/scanner.js',
  'js/vendor/quagga.min.js',
  'js/intervals.js',
  'js/instalar.js',
  'js/cofre.js',
  'js/screens/parts.js',
  'js/screens/acoes.js',
  'js/screens/comida.js',
  'js/screens/dashboard.js',
  'js/screens/sintomas.js',
  'js/screens/farmacia.js',
  'js/screens/relatorios.js',
];

const CLIMA = /(^|\.)open-meteo\.com$|api\.open-meteo\.com/;

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE_SHELL);
    await Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    for (const nome of await caches.keys()) {
      if (!nome.startsWith(VERSAO)) await caches.delete(nome);
    }
    await self.clients.claim();
  })());
});

/** Põe a resposta na cache sem esperar pelo chamador. */
function guardar(nomeCache, req, res) {
  if (!res || res.status !== 200 || res.type === 'opaque') return;
  caches.open(nomeCache).then((c) => c.put(req, res)).catch(() => {});
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const ehShell = url.origin === self.location.origin;

  /* --- clima: rede primeiro, última resposta boa como recurso --------- */
  if (!ehShell && CLIMA.test(url.hostname)) {
    ev.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) guardar(CACHE_DADOS, req, res.clone());
        return res;
      } catch {
        const velho = await caches.match(req, { ignoreSearch: true });
        return velho || new Response(JSON.stringify({ erro: 'offline' }), {
          status: 503, headers: { 'Content-Type': 'application/json' },
        });
      }
    })());
    return;
  }

  if (!ehShell) return;

  /* --- navegações: rede primeiro, index.html em cache como recurso ---- */
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    ev.respondWith((async () => {
      try {
        const res = await fetch(req);
        // um 5xx de um proxy/rede não é a app: usa a cópia em cache
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        guardar(CACHE_SHELL, 'index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('index.html')) || (await caches.match('./'))
          || new Response('<h1>Sem ligação</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  /* --- ficheiros da app: cache-first + revalidação em fundo ----------- */
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE_SHELL);
    const emCache = await cache.match(req, { ignoreSearch: true });
    const rede = fetch(req)
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    return emCache || (await rede) || new Response('Fora de linha', { status: 504 });
  })());
});

/* Mensagens da app: self.postMessage('saltar') força a ativação da nova versão. */
self.addEventListener('message', (ev) => {
  if (ev.data === 'saltar') self.skipWaiting();
});
