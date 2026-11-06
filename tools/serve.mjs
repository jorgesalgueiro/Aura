/** Servidor estático mínimo para testar a PWA em localhost. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, join } from 'node:path';

const RAIZ = resolve(process.argv[2] || '.');
const PORTA = +(process.argv[3] || 4173);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const fich = resolve(join(RAIZ, p));
    if (!fich.startsWith(RAIZ)) { res.writeHead(403).end('403'); return; }
    const info = await stat(fich);
    if (info.isDirectory()) { res.writeHead(404).end('404'); return; }
    const corpo = await readFile(fich);
    res.writeHead(200, {
      'Content-Type': MIME[extname(fich).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    }).end(corpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
  }
}).listen(PORTA, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORTA}/  →  ${RAIZ}`));
