/* ==========================================================================
   charts.js — gráficos SVG desenhados à mão (sem dependências externas)
   Todos os gráficos recebem largura explícita para evitar texto esmagado.
   ========================================================================== */

const nice = (v, d = 1) => Number(v.toFixed(d));
const paleta = { pressure: '#38bdf8', crisis: '#f87171', grid: 'rgba(255,255,255,.07)', axis: '#6f8098' };

export const corIntensidade = (i) =>
  i == null ? '#64748b' : i <= 0 ? '#34d399' : i <= 3 ? '#60a5fa' : i <= 6 ? '#fbbf24' : '#f87171';

function eixoY(min, max, passos = 4) {
  const span = (max - min) || 1;
  const pad = span * 0.12;
  const lo = min - pad, hi = max + pad;
  const ticks = Array.from({ length: passos + 1 }, (_, i) => lo + ((hi - lo) * i) / passos);
  return { lo, hi, ticks };
}

/**
 * Gráfico composto: linha da pressão atmosférica + barras de intensidade de crise.
 * @param {{dias:string[], pressaoDia:Object, crisesDia:Object, largura:number, altura?:number}} p
 */
export function chartPressaoVsCrises({ dias, pressaoDia, crisesDia, largura, altura = 210, mostrarLinhas = true }) {
  const m = { t: 14, r: 34, b: 26, l: 40 };
  const w = Math.max(280, largura), iw = w - m.l - m.r, ih = altura - m.t - m.b;
  const n = dias.length;
  const step = iw / Math.max(1, n);

  const pVals = dias.map(d => pressaoDia[d]).filter(v => v != null);
  const ey = pVals.length ? eixoY(Math.min(...pVals), Math.max(...pVals), 4) : { lo: 1000, hi: 1020, ticks: [1000, 1005, 1010, 1015, 1020] };
  const yP = (v) => m.t + ih - ((v - ey.lo) / (ey.hi - ey.lo)) * ih;
  const yI = (v) => m.t + ih - (v / 10) * ih;
  const x  = (i) => m.l + step * (i + 0.5);

  let g = '';
  for (const t of ey.ticks) {
    const y = yP(t);
    g += `<line class="grid-lne" x1="${m.l}" y1="${nice(y)}" x2="${w - m.r}" y2="${nice(y)}"/>`;
    g += `<text class="axis-lbl" x="${m.l - 7}" y="${nice(y + 3.4)}" text-anchor="end">${nice(t, 0)}</text>`;
  }
  // escala da direita (intensidade)
  [0, 5, 10].forEach(v => { g += `<text class="axis-lbl" x="${w - m.r + 7}" y="${nice(yI(v) + 3.4)}" fill="#f87171">${v}</text>`; });

  // barras de intensidade
  let bars = '';
  dias.forEach((d, i) => {
    const inten = crisesDia[d]?.max;
    if (!inten) return;
    const bw = Math.max(4, Math.min(22, step * 0.56));
    const y = yI(inten), h = m.t + ih - y;
    bars += `<rect class="cbar" x="${nice(x(i) - bw / 2)}" y="${nice(y)}" width="${nice(bw)}" height="${nice(Math.max(2, h))}"
      rx="3" fill="${corIntensidade(inten)}" opacity=".62"><title>${d} · intensidade ${inten}/10 · ${crisesDia[d].n} crise(s)</title></rect>`;
  });

  // linha de pressão
  let line = '', area = '', dots = '';
  const pts = dias.map((d, i) => (pressaoDia[d] != null ? [x(i), yP(pressaoDia[d]), d] : null)).filter(Boolean);
  if (pts.length > 1 && mostrarLinhas) {
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${nice(p[0])},${nice(p[1])}`).join(' ');
    area = `<path d="${path} L${nice(pts.at(-1)[0])},${m.t + ih} L${nice(pts[0][0])},${m.t + ih} Z" fill="url(#pg)" opacity=".55"/>`;
    line = `<path d="${path}" fill="none" stroke="${paleta.pressure}" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"/>`;
    dots = pts.map(p => `<circle cx="${nice(p[0])}" cy="${nice(p[1])}" r="2.6" fill="#0b1220" stroke="${paleta.pressure}" stroke-width="1.8"><title>${p[2]} · ${nice(p[1], 1)} hPa</title></circle>`).join('');
  }

  // rótulos do eixo X (esparsos)
  const salto = Math.ceil(n / (iw / 52));
  let xl = '';
  dias.forEach((d, i) => {
    if (i % salto) return;
    const [, mm, dd] = d.split('-');
    xl += `<text class="axis-lbl" x="${nice(x(i))}" y="${altura - 8}" text-anchor="middle">${dd}/${mm}</text>`;
  });

  return `<svg width="${w}" height="${altura}" role="img" aria-label="Pressão atmosférica diária e intensidade máxima de enxaqueca">
    <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#38bdf8" stop-opacity=".28"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
    </linearGradient></defs>
    ${g}${bars}${area}${line}${dots}${xl}
  </svg>`;
}

/** Mini série temporal (sparkline) com marca do valor atual. */
let _seq = 0;
const nid = (p) => `${p}${++_seq}`;
export function sparkline(valores, { largura = 150, altura = 40, cor = paleta.pressure, mostrarPonto = true } = {}) {
  const vs = valores.filter(v => v != null);
  if (vs.length < 2) return `<div class="muted">Sem histórico suficiente.</div>`;
  const gid = nid('sg');
  const min = Math.min(...vs), max = Math.max(...vs), span = (max - min) || 1;
  const X = (i) => (i / (vs.length - 1)) * (largura - 4) + 2;
  const Y = (v) => altura - 4 - ((v - min) / span) * (altura - 10);
  const path = vs.map((v, i) => `${i ? 'L' : 'M'}${nice(X(i), 1)},${nice(Y(v), 1)}`).join(' ');
  const ultimo = vs.length - 1;
  return `<svg width="${largura}" height="${altura}" role="img" aria-label="Evolução das últimas horas">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${cor}" stop-opacity=".32"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${path} L${nice(X(ultimo), 1)},${altura} L${nice(X(0), 1)},${altura} Z" fill="url(#${gid})"/>
    <path d="${path}" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${mostrarPonto ? `<circle cx="${nice(X(ultimo), 1)}" cy="${nice(Y(vs[ultimo]), 1)}" r="3" fill="${cor}"/>` : ''}
    <text class="axis-lbl" x="2" y="9">${nice(max, 0)}</text>
    <text class="axis-lbl" x="2" y="${altura - 1}">${nice(min, 0)}</text>
  </svg>`;
}

/**
 * Gráfico composto genérico — usado pelo seletor de variáveis do Ecrã 6.
 * @param {{dias:string[], linha:{vals:Object,nome:string,cor:string,dec?:number}, barras?:{vals:Object,nome:string,cor:string}, largura:number, altura?:number}} p
 */
export function chartRelacao({ dias, linha, barras, largura, altura = 220 }) {
  const gid = nid('pg');
  const m = { t: 14, r: barras ? 34 : 14, b: 26, l: 44 };
  const w = Math.max(280, largura), iw = w - m.l - m.r, ih = altura - m.t - m.b;
  const n = dias.length, step = iw / Math.max(1, n);
  const lv = dias.map(d => linha.vals[d]).filter(v => v != null);
  if (!lv.length) return `<div class="empty">Sem dados para esta variável no período escolhido.</div>`;
  const ey = eixoY(Math.min(...lv), Math.max(...lv), 4);
  const yL = (v) => m.t + ih - ((v - ey.lo) / (ey.hi - ey.lo)) * ih;
  const x = (i) => m.l + step * (i + 0.5);

  let g = '';
  for (const t of ey.ticks) {
    g += `<line class="grid-lne" x1="${m.l}" y1="${nice(yL(t))}" x2="${w - m.r}" y2="${nice(yL(t))}"/>`;
    g += `<text class="axis-lbl" x="${m.l - 7}" y="${nice(yL(t) + 3.4)}" text-anchor="end">${nice(t, linha.dec ? 0 : (ey.hi - ey.lo < 6 ? 1 : 0))}</text>`;
  }

  let bars = '';
  if (barras) {
    const bv = dias.map(d => barras.vals[d]).filter(v => v != null);
    const maxB = Math.max(1, ...bv);
    dias.forEach((d, i) => {
      const v = barras.vals[d];
      if (v == null || !v) return;
      const bw = Math.max(4, Math.min(22, step * 0.56));
      const h = (v / maxB) * ih;
      bars += `<rect class="cbar" x="${nice(x(i) - bw / 2)}" y="${nice(m.t + ih - h)}" width="${nice(bw)}" height="${nice(Math.max(2, h))}"
        rx="3" fill="${barras.cor}" opacity=".55"><title>${d} · ${barras.nome}: ${nice(v, 1)}</title></rect>`;
    });
    [0, Math.round(maxB / 2), maxB].forEach(v => {
      g += `<text class="axis-lbl" x="${w - m.r + 7}" y="${nice(m.t + ih - (v / maxB) * ih + 3.4)}" fill="${barras.cor}">${nice(v, 0)}</text>`;
    });
  }

  const pts = dias.map((d, i) => (linha.vals[d] != null ? [x(i), yL(linha.vals[d]), d, linha.vals[d]] : null)).filter(Boolean);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${nice(p[0])},${nice(p[1])}`).join(' ');
  const area = `<path d="${path} L${nice(pts.at(-1)[0])},${m.t + ih} L${nice(pts[0][0])},${m.t + ih} Z" fill="url(#${gid})" opacity=".5"/>`;
  const line = pts.length > 1 ? `<path d="${path}" fill="none" stroke="${linha.cor}" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"/>` : '';
  const dots = pts.map(p => `<circle cx="${nice(p[0])}" cy="${nice(p[1])}" r="2.6" fill="#0b1220" stroke="${linha.cor}" stroke-width="1.8"><title>${p[2]} · ${nice(p[3], 1)}</title></circle>`).join('');

  const salto = Math.ceil(n / (iw / 52));
  let xl = '';
  dias.forEach((d, i) => {
    if (i % salto) return;
    const [, mm, dd] = d.split('-');
    xl += `<text class="axis-lbl" x="${nice(x(i))}" y="${altura - 8}" text-anchor="middle">${dd}/${mm}</text>`;
  });

  return `<svg width="${w}" height="${altura}" role="img" aria-label="${escT(linha.nome)} por dia">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${linha.cor}" stop-opacity=".26"/><stop offset="1" stop-color="${linha.cor}" stop-opacity="0"/>
    </linearGradient></defs>
    ${g}${bars}${area}${line}${dots}${xl}
  </svg>`;
}

/** Barras horizontais genéricas (ex.: gatilhos mais frequentes). */
export function barrasHorizontais(itens, { largura, cor = paleta.pressure, sufixo = '' } = {}) {
  const max = Math.max(1, ...itens.map(i => i.valor));
  const rowH = 27, w = Math.max(260, largura);
  const labelW = Math.min(140, w * 0.42);
  const h = itens.length * rowH + 6;
  let out = '';
  itens.forEach((it, i) => {
    const y = i * rowH + 4;
    const bw = Math.max(3, ((w - labelW - 46) * it.valor) / max);
    out += `<text class="axis-lbl" x="0" y="${y + 15}" fill="#a9b7c9" style="font-size:11px">${escT(it.rotulo)}</text>`;
    out += `<rect x="${labelW}" y="${y + 5}" width="${nice(w - labelW - 46)}" height="14" rx="7" fill="rgba(255,255,255,.06)"/>`;
    out += `<rect class="cbar" x="${labelW}" y="${y + 5}" width="${nice(bw)}" height="14" rx="7" fill="${it.cor || cor}"><title>${escT(it.rotulo)}: ${it.valor}${sufixo}</title></rect>`;
    out += `<text class="axis-lbl" x="${w - 4}" y="${y + 16}" text-anchor="end" fill="#eef4fb" style="font-size:11px;font-weight:700">${it.valor}${sufixo}</text>`;
  });
  return `<svg width="${w}" height="${h}" role="img" aria-label="Gráfico de barras">${out}</svg>`;
}

/** Anel de progresso (água, aderência à medicação). */
let _anelSeq = 0;
export function anel({ valor, total, tamanho = 116, espessura = 11, cor = '', centro = '' }) {
  const id = `wg${++_anelSeq}`;
  const r = (tamanho - espessura) / 2, c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.max(0, Math.min(1, valor / total)) : 0;
  return `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#2dd4bf"/></linearGradient></defs>
    <circle class="ring-bg" cx="${tamanho / 2}" cy="${tamanho / 2}" r="${r}" stroke-width="${espessura}"/>
    <circle class="ring-fg" cx="${tamanho / 2}" cy="${tamanho / 2}" r="${r}" stroke-width="${espessura}"
      stroke="${cor || `url(#${id})`}" stroke-dasharray="${nice(c)}" stroke-dashoffset="${nice(c * (1 - pct))}"/>
    ${centro}
  </svg>`;
}

/** Mini gráfico de barras empilhadas para fases do sono. */
export function barrasSono({ profundo, rem, leve }, { largura, altura = 16 } = {}) {
  const tot = Math.max(1, (profundo || 0) + (rem || 0) + (leve || 0));
  const w = Math.max(120, largura);
  const seg = [['#38bdf8', profundo], ['#a78bfa', rem], ['#64748b', leve]];
  let x = 0, out = '';
  for (const [cor, v] of seg) {
    const bw = ((v || 0) / tot) * w;
    if (bw > 0.5) { out += `<rect x="${nice(x)}" y="0" width="${nice(bw)}" height="${altura}" fill="${cor}" opacity=".9"/>`; x += bw; }
  }
  return `<svg width="${w}" height="${altura}" role="img" aria-label="Fases do sono"><rect width="${w}" height="${altura}" rx="${altura / 2}" fill="rgba(255,255,255,.06)"/>${out}</svg>`;
}

/** Dispersão pressão no início da crise vs intensidade. */
export function dispersao(pontos, { largura, altura = 200, xLabel = 'Pressão (hPa)', yLabel = 'Intensidade' } = {}) {
  const m = { t: 12, r: 14, b: 30, l: 30 };
  const w = Math.max(260, largura), iw = w - m.l - m.r, ih = altura - m.t - m.b;
  const xs = pontos.map(p => p.x).filter(v => v != null);
  if (!xs.length) return `<div class="empty">Sem pares de dados suficientes.</div>`;
  const ex = eixoY(Math.min(...xs), Math.max(...xs), 4);
  const X = (v) => m.l + ((v - ex.lo) / (ex.hi - ex.lo)) * iw;
  const Y = (v) => m.t + ih - (v / 10) * ih;
  /* O eixo vertical é a intensidade (0–10); a pressão é o eixo horizontal.
     As marcas de 0/5/10 servem simultaneamente de grelha e de etiquetas. */
  let g = '';
  [0, 5, 10].forEach(v => {
    g += `<line class="grid-lne" x1="${m.l}" y1="${nice(Y(v))}" x2="${w - m.r}" y2="${nice(Y(v))}" stroke-dasharray="2 4"/>
          <text class="axis-lbl" x="${m.l - 6}" y="${nice(Y(v) + 3.4)}" text-anchor="end">${v}</text>`;
  });
  const dots = pontos.map(p => p.x == null ? '' :
    `<circle class="cbar" cx="${nice(X(p.x))}" cy="${nice(Y(p.y))}" r="${4 + p.y * 0.5}" fill="${corIntensidade(p.y)}" opacity=".72">
       <title>${escT(p.rotulo || '')} · ${nice(p.x, 1)} hPa · ${p.y}/10</title></circle>`).join('');
  return `<svg width="${w}" height="${altura}" role="img" aria-label="${escT(yLabel)} contra ${escT(xLabel)}">${g}
    <text class="axis-lbl" x="${m.l}" y="${altura - 6}">${escT(xLabel)}</text>
    <text class="axis-lbl" x="${w - m.r}" y="${altura - 6}" text-anchor="end">${nice(ex.lo, 0)}–${nice(ex.hi, 0)} hPa</text>
    ${dots}</svg>`;
}

const escT = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
