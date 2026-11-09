/* ==========================================================================
   utils.js — helpers de DOM, folhas modais, toasts, háptica e ícones
   ========================================================================== */

import { settingsCache } from './store.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Cria um elemento a partir de HTML. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const on = (node, ev, sel, fn) => {
  node.addEventListener(ev, (e) => {
    const m = e.target.closest(sel);
    if (m && node.contains(m)) fn(e, m);
  });
};

export const fmt = (n, dec = 0) =>
  n == null || Number.isNaN(n) ? '—'
    : new Intl.NumberFormat('pt-PT', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);

export const dataLonga = (chaveOuData) => {
  const d = (chaveOuData instanceof Date) ? chaveOuData
    : new Date(typeof chaveOuData === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(chaveOuData) ? chaveOuData + 'T12:00' : chaveOuData);
  const s = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const dataCurta = (d) =>
  new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short' }).format(new Date(d));

/* -------------------------------------------------------------- háptica -- */

/**
 * Feedback tátil. iOS Safari não expõe Vibration API → degradação silenciosa.
 * O interruptor “Feedback háptico” das Definições é respeitado: quando está
 * desligado, nenhum controlo vibra.
 */
export function haptic(pattern = 8) {
  const s = settingsCache();
  if (s && s.haptics === false) return;
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch { /* ignorado */ }
}

/* ---------------------------------------------------------------- toasts */

export function toast(msg, kind = 'ok', ms = 2600) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = el(`<div class="toast ${kind}"><i class="tbar"></i><span>${esc(msg)}</span></div>`);
  root.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 260);
  }, ms);
}

/* ---------------------------------------------------------------- sheet  */

/**
 * Pilha de folhas abertas. Só a última responde a Escape/Tab: abrir uma folha
 * a partir de outra (ex.: Definições → cópia .aura) não faz a de trás fechar.
 */
const folhas = [];

/** Há uma folha modal aberta? (os atalhos globais devem ficar quietos) */
export const folhaAberta = () => folhas.length > 0;

function teclaNasFolhas(e) {
  const topo = folhas[folhas.length - 1];
  if (!topo) return;

  if (e.key === 'Escape') { e.preventDefault(); topo.fechar(); return; }
  if (e.key !== 'Tab') return;

  /* Focus trap: Tab/Shift+Tab ciclam dentro da folha do topo */
  const focusable = topo.scrim.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]'
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else if (document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
}
document.addEventListener('keydown', teclaNasFolhas);

/**
 * Abre uma folha modal (bottom sheet) e devolve { root, fechar, body }.
 * `corpo` pode ser HTML string ou um elemento.
 */
export function sheet({ titulo = '', sub = '', corpo = '', acoes = '', larguraCheia = false, autoFocus = true, aoFechar } = {}) {
  const root = document.getElementById('sheet-root');
  const scrim = el(`
    <div class="scrim" role="dialog" aria-modal="true" aria-label="${esc(titulo || 'Detalhes')}">
      <div class="sheet"${larguraCheia ? ' style="max-width:720px"' : ''}>
        <div class="grabber"></div>
        ${titulo ? `<div class="sheet-head"><h2 class="sheet-title">${esc(titulo)}</h2>
          <button class="icon-btn" data-fechar aria-label="Fechar">
            <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>` : ''}
        ${sub ? `<p class="sheet-sub">${esc(sub)}</p>` : ''}
        <div class="sheet-body"></div>
        ${acoes ? `<div class="btn-row mt20">${acoes}</div>` : ''}
      </div>
    </div>`);
  const body = scrim.querySelector('.sheet-body');
  if (typeof corpo === 'string') body.innerHTML = corpo; else if (corpo) body.appendChild(corpo);

  const focoAnterior = document.activeElement;
  let fechada = false;

  const fechar = () => {
    if (fechada) return;
    fechada = true;
    const i = folhas.findIndex(f => f.fechar === fechar);
    if (i >= 0) folhas.splice(i, 1);
    scrim.classList.remove('in');
    setTimeout(() => scrim.remove(), 240);
    if (typeof aoFechar === 'function') aoFechar();
    // devolve o foco a quem abriu a folha (teclado e leitores de ecrã)
    if (focoAnterior && focoAnterior.isConnected && typeof focoAnterior.focus === 'function') {
      try { focoAnterior.focus({ preventScroll: true }); } catch { /* ignorado */ }
    }
  };

  scrim.addEventListener('click', (e) => {
    if (e.target === scrim || e.target.closest('[data-fechar]')) fechar();
  });

  root.appendChild(scrim);
  folhas.push({ scrim, fechar });
  requestAnimationFrame(() => scrim.classList.add('in'));
  const first = autoFocus ? scrim.querySelector('input, textarea, select, button:not([data-fechar])') : null;
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 260);

  return { root: scrim, body, fechar };
}

/* ---------------------------------------------------------------- ícones */

/* Traço por omissão: sem isto, um ícone dentro de um elemento sem regra CSS
   própria (ex.: .chip) renderiza como mancha preta. O CSS continua a ganhar,
   porque as regras da folha de estilos têm prioridade sobre os atributos. */
const P = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICON = {
  agua:    P('<path d="M12 2.7 6.8 9.4a6.6 6.6 0 1 0 10.4 0L12 2.7Z"/>'),
  pilula:  P('<rect x="2.6" y="8.4" width="12" height="7" rx="3.5" transform="rotate(-45 8.6 11.9)"/><path d="M10.5 6.5 17 13"/><path d="M18 4.5h3.5M20 2.5v4"/>'),
  raio:    P('<path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z"/>'),
  cabeca:  P('<path d="M15.5 3.6a6 6 0 0 0-8.2 6.3c0 2 .6 2.7 1.3 3.6.5.6.6 1.1.7 2 .1.9.3 1.5 1.1 1.9"/><path d="M12.5 20.5h-3a2 2 0 0 1-2-2v-1"/><path d="M14 20.5a5.5 5.5 0 0 0 3.4-5.2v-1.1a4 4 0 0 0 1.6-3.2V9a6 6 0 0 0-5-5.9"/><circle cx="10" cy="10.5" r="1"/>'),
  sono:    P('<path d="M20.5 14.3A8.5 8.5 0 1 1 9.7 3.5a7 7 0 0 0 10.8 10.8Z"/>'),
  passo:   P('<path d="M8.5 5.5a2.5 2.5 0 1 0-5 0c0 1.6.7 2.4 1.3 3.6.5 1 .7 1.8.7 2.9a2 2 0 0 0 4 0c0-1.4-.4-2.3-.9-3.3-.5-1.1-.1-2.2-.1-3.2Z"/><path d="M15 12.5a2.5 2.5 0 1 0 5 0c0-1.6-.7-2.4-1.3-3.6-.5-1-.7-1.8-.7-2.9a2 2 0 0 0-4 0c0 1.4.4 2.3.9 3.3.5 1.1.1 2.2.1 3.2Z"/><path d="M8 20.5h2M14 20.5h2"/>'),
  coracao: P('<path d="M12 20.3s-7.7-4.6-7.7-9.8A4.5 4.5 0 0 1 12 7.6a4.5 4.5 0 0 1 7.7 2.9c0 5.2-7.7 9.8-7.7 9.8Z"/>'),
  peso:    P('<path d="M4.6 8.5h14.8l1.6 11.2a1.6 1.6 0 0 1-1.6 1.8H4.6a1.6 1.6 0 0 1-1.6-1.8L4.6 8.5Z"/><circle cx="12" cy="5.6" r="2.6"/>'),
  tempo:   P('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.5V12l3 1.9"/>'),
  termo:   P('<path d="M14 14.8V5.5a2.5 2.5 0 1 0-5 0v9.3a4.2 4.2 0 1 0 5 0Z"/><path d="M11.5 9.5v6.4"/>'),
  comida:  P('<path d="M6 3v8.5M9 3v8.5M7.5 11.5V21"/><path d="M16.5 3c-1.6 1.2-2.3 3.2-2.3 5.6 0 1.8.8 2.9 2.3 2.9V21"/>'),
  codigo:  P('<path d="M4 5v14M7 5v14M10.5 5v9M14 5v14M17.5 5v14M20.5 5v9"/>'),
  alerta:  P('<path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4M12 16.8v.1"/>'),
  cama:    P('<path d="M3 18V7M3 12h13a5 5 0 0 1 5 5v1M3 18h18"/><circle cx="7.5" cy="10" r="1.8"/>'),
  grafico: P('<path d="M4 20V4M4 20h16"/><path d="M7.5 15.5l3.5-4.5 3 2.5 4.5-6.5"/>'),
  download:P('<path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>'),
  upload:  P('<path d="M12 15.5v-11M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 19.5h15"/>'),
  lapis:   P('<path d="M16.5 3.6 20.4 7.5 8.7 19.2l-4.6 1 1-4.6L16.5 3.6Z"/><path d="m14.7 5.4 3.9 3.9"/>'),
  lixo:    P('<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13.5h9L17.5 7"/><path d="M10.5 11v6M13.5 11v6"/>'),
  mais:    P('<path d="M12 5v14M5 12h14"/>'),
  check:   P('<path d="m5 13 4.5 4.5L19 7"/>'),
  nuvem:   P('<path d="M7.2 18.5A4.2 4.2 0 0 1 7 10.1a5.4 5.4 0 0 1 10.4 1.3 3.6 3.6 0 0 1-.6 7.1H7.2Z"/>'),
  engren:  P('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.4 15h-.2a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3.6 8.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9.3 4.4V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z"/>'),
  seta:    P('<path d="m9 6 6 6-6 6"/>'),
  info:    P('<circle cx="12" cy="12" r="8.6"/><path d="M12 11.2v5M12 8v.1"/>'),
  cerebro: P('<path d="M9.5 4.2A2.7 2.7 0 0 0 6.8 7a2.6 2.6 0 0 0-1.6 4.4A2.7 2.7 0 0 0 6.4 16a2.6 2.6 0 0 0 3.1 3.2V4.2Z"/><path d="M14.5 4.2A2.7 2.7 0 0 1 17.2 7a2.6 2.6 0 0 1 1.6 4.4 2.7 2.7 0 0 1-1.2 4.6 2.6 2.6 0 0 1-3.1 3.2V4.2Z"/>'),
  escama:  P('<path d="M6.5 4.6a3.2 3.2 0 1 0 3.6 5.1 3.2 3.2 0 1 0-3.6-5.1Z"/><path d="M13.9 9.3a3.2 3.2 0 1 0 3.6 5.1 3.2 3.2 0 1 0-3.6-5.1Z"/><path d="m9.4 9.9 5.2 3.1"/>'),
  pin:     P('<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>'),
  share:   P('<path d="M12 15.5V3.8M8.4 7.2 12 3.6l3.6 3.6"/><path d="M5.5 13v6.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V13"/>'),
  imprimir:P('<path d="M7 9V3.8h10V9"/><rect x="4" y="9" width="16" height="7.5" rx="1.8"/><path d="M7 14.5h10v5.7H7z"/>'),
  livro:   P('<path d="M4.5 4.2h9.8a3.7 3.7 0 0 1 3.7 3.7v12H8.2a3.7 3.7 0 0 0-3.7 3.7V4.2Z" transform="translate(0 -1) scale(0.95)"/><path d="M18 4.2H20v14"/>'),
};

/** Pictogramas da Escala de Bristol (1–7). */
export function bristolSVG(tipo) {
  const blob = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" opacity=".92"/>`;
  const log = (x, y, w, h, r = 7) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="currentColor" opacity=".92"/>`;
  const partes = {
    1: blob(9, 10, 4) + blob(19, 12, 4.4) + blob(29, 10, 4),
    2: log(4, 7, 32, 11, 6) + `<circle cx="12" cy="12.5" r="1.6" fill="#0b1220" opacity=".35"/><circle cx="20" cy="12.5" r="1.6" fill="#0b1220" opacity=".35"/><circle cx="28" cy="12.5" r="1.6" fill="#0b1220" opacity=".35"/>`,
    3: log(4, 8, 32, 10, 5) + `<path d="M4 13h32" stroke="#0b1220" stroke-opacity=".35" stroke-width="1.4" stroke-dasharray="4 3"/>`,
    4: log(4, 9, 32, 8, 4),
    5: blob(8, 12, 4) + blob(17, 12, 4.6) + blob(26, 12, 4) + blob(33, 12, 2.6),
    6: `<path d="M4 13c4-5 8 3 12-1s8 4 12 0 6 2 8 1" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none" opacity=".9"/>`,
    7: `<path d="M3 11h34" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".75"/><path d="M6 16.5h28" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".5"/><path d="M10 20.5h20" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".3"/>`,
  };
  return `<svg viewBox="0 0 40 26" aria-hidden="true">${partes[tipo] || partes[4]}</svg>`;
}

/** Mapa interativo da cabeça (Ecrã 2). As zonas são clicáveis. */
export function headMapSVG(zonasSel = []) {
  const pressed = (id) => zonasSel.includes(id) ? 'true' : 'false';
  return `
<svg viewBox="0 0 200 224" role="group" aria-label="Mapa da cabeça — selecione as zonas afetadas">
  <path class="head-outline" d="M100 16c34 0 56 24 56 58 0 14-2 24-5 34-4 13-8 20-12 30-4 9-6 18-6 28h-66c0-10-2-19-6-28-4-10-8-17-12-30-3-10-5-20-5-34C42 40 66 16 100 16Z"/>
  <g class="zone" data-zona="frontal" aria-pressed="${pressed('frontal')}" tabindex="0" role="button" aria-label="Zona frontal">
    <path d="M100 22c30 0 50 20 51 47-17-7-33-10-51-10s-34 3-51 10C50 42 70 22 100 22Z"/>
  </g>
  <g class="zone" data-zona="lateral_esq" aria-pressed="${pressed('lateral_esq')}" tabindex="0" role="button" aria-label="Lateral esquerda">
    <path d="M49 73c11-4 21-6 31-7v56c-9 1-16 3-23 6-4-9-6-18-7-29-1-9-1-17-1-26Z"/>
  </g>
  <g class="zone" data-zona="lateral_dir" aria-pressed="${pressed('lateral_dir')}" tabindex="0" role="button" aria-label="Lateral direita">
    <path d="M151 73c0 9 0 17-1 26-1 11-3 20-7 29-7-3-14-5-23-6V66c10 1 20 3 31 7Z"/>
  </g>
  <g class="zone" data-zona="occipital" aria-pressed="${pressed('occipital')}" tabindex="0" role="button" aria-label="Zona occipital">
    <path d="M57 132c8-3 17-5 27-6 9 24 9 41 6 58H77c-4-10-8-17-12-27-3-8-5-16-8-25Zm86 0c-3 9-5 17-8 25-4 10-8 17-12 27h-13c-3-17-3-34 6-58 10 1 19 3 27 6Z"/>
  </g>
  <g class="zone" data-zona="ocular" aria-pressed="${pressed('ocular')}" tabindex="0" role="button" aria-label="Zona ocular">
    <path d="M80 66c8-1 15-2 20-2s12 1 20 2v22c-8-2-14-3-20-3s-12 1-20 3V66Z"/>
  </g>
  <g aria-hidden="true" opacity=".5">
    <ellipse cx="86" cy="80" rx="6" ry="3.4" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.4"/>
    <ellipse cx="114" cy="80" rx="6" ry="3.4" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.4"/>
    <path d="M100 86v10M95 104h10" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.4" stroke-linecap="round"/>
  </g>
  <text class="zone-label" x="100" y="46" text-anchor="middle">FRONTAL</text>
  <text class="zone-label" x="27" y="100" text-anchor="middle" transform="rotate(-90 27 100)">LATERAL E.</text>
  <text class="zone-label" x="173" y="100" text-anchor="middle" transform="rotate(90 173 100)">LATERAL D.</text>
  <text class="zone-label" x="100" y="99" text-anchor="middle">OCULAR</text>
  <text class="zone-label" x="100" y="170" text-anchor="middle">OCCIPITAL</text>
</svg>`;
}
