/**
 * tools/mkicon.mjs — gera os ícones PNG da PWA sem dependências externas.
 *
 * Desenha a marca do Aura (tile em gradiente céu→turquesa com o anel "aura"
 * aberto no topo direito e um traço de pulso no centro) por rasterização
 * direta, com 3× de supersampling para os cantos ficarem suaves.
 *
 *   node tools/mkicon.mjs
 *
 * Produz em assets/icons/:
 *   icon-192.png  icon-384.png  icon-512.png   (cantos arredondados, fundo transparente)
 *   maskable-512.png                            (sangue total, conteúdo na safe zone)
 *   apple-touch-icon.png                        (180, sangue total — o iOS aplica a máscara)
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------- paleta ---- */

const SKY = [56, 189, 248];
const TEAL = [45, 212, 191];
const INK = [6, 14, 24];

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/* --------------------------------------------------------- geometria ----- */

/** Distância signada ao interior de um rectângulo arredondado. */
function sdRoundRect(px, py, cx, cy, half, r) {
  const qx = Math.abs(px - cx) - (half - r);
  const qy = Math.abs(py - cy) - (half - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/**
 * Um pixel do ícone.
 * @param {number} u  coordenada x em [0,1)
 * @param {number} v  coordenada y em [0,1)
 * @param {object} o  { sangrar: bool, escala: número }
 */
function pixel(u, v, { sangrar, escala }) {
  const S = 1; // espaço normalizado
  const cx = 0.5, cy = 0.5;

  /* --- fundo: tile arredondado ou sangue total --- */
  let alpha = 0;
  let rgb;

  if (sangrar) {
    alpha = 1;
  } else {
    const d = sdRoundRect(u, v, cx, cy, 0.5 * escala, 0.225 * escala);
    if (d > 0.004) return [0, 0, 0, 0];
    alpha = Math.max(0, Math.min(1, 0.5 - d / 0.008));
  }

  // gradiente diagonal + leve luz no topo esquerdo
  const t = Math.max(0, Math.min(1, (u + v) / 2));
  rgb = mix(SKY, TEAL, t);
  const brilho = Math.max(0, 1 - Math.hypot(u - 0.24, v - 0.2) / 0.62);
  rgb = rgb.map((c, i) => Math.min(255, Math.round(c + brilho * 26 * (i === 2 ? 0.5 : 1))));
  // som no canto inferior direito, para dar volume
  const sombra = Math.max(0, (u + v - 1.28) / 0.6);
  rgb = rgb.map(c => Math.max(0, Math.round(c - sombra * 30)));

  /* --- glifo: escala relativa ao tile --- */
  const g = escala;
  const ox = 0.5, oy = 0.478;
  const e = 0.0075; // espessura de amostragem

  // anel "aura" com abertura no topo direito
  const R = 0.275 * g, r0 = 0.186 * g;
  const dx = u - ox, dy = v - oy;
  const rad = Math.hypot(dx, dy);
  let ang = Math.atan2(-dy, dx) * 180 / Math.PI;      // y para cima
  if (ang < 0) ang += 360;
  const lacuna = ang > 5 && ang < 82;                  // arco superior direito
  const noAnel = rad > r0 && rad < R && !lacuna;

  // traço de pulso dentro do anel
  const pts = [
    [-0.205, 0.015], [-0.095, 0.015], [-0.035, -0.095],
    [0.028, 0.105], [0.072, -0.012], [0.205, -0.012],
  ].map(([a, b]) => [ox + a * g, oy + b * g]);
  const gross = 0.033 * g;
  let noPulso = false;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distSeg(u, v, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < gross) { noPulso = true; break; }
  }
  // ponta do traço em círculo
  for (const p of [pts[0], pts.at(-1)]) {
    if (Math.hypot(u - p[0], v - p[1]) < gross) { noPulso = true; break; }
  }

  if (noAnel || noPulso) {
    const tinta = 0.92;
    rgb = rgb.map((c, i) => Math.round(c + (INK[i] - c) * tinta));
  } else {
    // contorno escuro subtil em redor do glifo, aumenta legibilidade a 192 px
    const pertoAnel = Math.abs(rad - R) < e || Math.abs(rad - r0) < e;
    if (pertoAnel && !lacuna) rgb = rgb.map(c => Math.round(c * 0.88));
  }

  return [rgb[0], rgb[1], rgb[2], Math.round(alpha * 255)];
}

/* ------------------------------------------------------ amostragem ------- */

function render(size, { sangrar = false, escala = 1, ss = 3 } = {}) {
  const hi = size * ss;
  const buf = new Float64Array(hi * hi * 4);
  for (let y = 0; y < hi; y++) {
    for (let x = 0; x < hi; x++) {
      const [r, g, b, a] = pixel((x + 0.5) / hi, (y + 0.5) / hi, { sangrar, escala });
      // pre-multiplied para o downsample não escurecer bordas transparentes
      const i = (y * hi + x) * 4;
      const af = a / 255;
      buf[i] = r * af; buf[i + 1] = g * af; buf[i + 2] = b * af; buf[i + 3] = af;
    }
  }
  const out = Buffer.alloc(size * size * 4);
  const area = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let pr = 0, pg = 0, pb = 0, pa = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const i = ((y * ss + sy) * hi + (x * ss + sx)) * 4;
          pr += buf[i]; pg += buf[i + 1]; pb += buf[i + 2]; pa += buf[i + 3];
        }
      }
      const a = pa / area;
      const o = (y * size + x) * 4;
      const inv = a > 0 ? 1 / a : 0;
      out[o] = Math.round(Math.min(255, (pr / area) * inv));
      out[o + 1] = Math.round(Math.min(255, (pg / area) * inv));
      out[o + 2] = Math.round(Math.min(255, (pb / area) * inv));
      out[o + 3] = Math.round(a * 255);
    }
  }
  return out;
}

/* ------------------------------------------------------------ codificar -- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'latin1');
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([head, t, data, crc]);
}

function png(largura, altura, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;   // profundidade de bits
  ihdr[9] = 6;   // truecolor + alpha
  const raw = Buffer.alloc((largura * 4 + 1) * altura);
  for (let y = 0; y < altura; y++) {
    const src = y * largura * 4;
    raw[y * (largura * 4 + 1)] = 0;                       // filtro "none"
    rgba.copy(raw, y * (largura * 4 + 1) + 1, src, src + largura * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------- gerar --- */

const alvos = [
  { nome: 'icon-192.png', tam: 192 },
  { nome: 'icon-384.png', tam: 384 },
  { nome: 'icon-512.png', tam: 512 },
  { nome: 'maskable-512.png', tam: 512, sangrar: true, escala: 0.78 },
  { nome: 'apple-touch-icon.png', tam: 180, sangrar: true, escala: 0.86, ss: 4 },
];

for (const a of alvos) {
  const t0 = Date.now();
  const rgba = render(a.tam, { sangrar: !!a.sangrar, escala: a.escala || 1, ss: a.ss || 3 });
  const bin = png(a.tam, a.tam, rgba);
  writeFileSync(join(OUT, a.nome), bin);
  console.log(`${a.nome.padEnd(22)} ${a.tam}×${a.tam}  ${(bin.length / 1024).toFixed(1)} kB  ${Date.now() - t0} ms`);
}
console.log('\nícones escritos em assets/icons/');
