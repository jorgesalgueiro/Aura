/* ==========================================================================
   screens/parts.js — blocos de UI reutilizados pelos ecrãs (estilo widgets)
   ========================================================================== */

import { esc, ICON } from '../utils.js';

/** Cabeçalho de ecrã: kicker + título + subtítulo. */
export function cabecalho({ kicker, titulo, sub = '' }) {
  return `<div class="screen-head fade-in">
    ${kicker ? `<div class="screen-kicker">${esc(kicker)}</div>` : ''}
    <h1 class="screen-title">${esc(titulo)}</h1>
    ${sub ? `<p class="screen-sub">${esc(sub)}</p>` : ''}
  </div>`;
}

/** Cartão-métrica estilo widget nativo (Ecrã 1). */
export function metrico({ icone = 'info', cor = 'teal', label, valor, unidade = '', foot = '', href, accao }) {
  const interativo = !!(href || accao);
  return `<div class="card${interativo ? ' tap' : ''}"${href ? ` data-goto="${href}"` : ''}${accao ? ` data-acao="${esc(accao)}"` : ''}${interativo ? ' role="button" tabindex="0"' : ''}>
    <div class="split" style="align-items:flex-start">
      <div>
        <div class="metric-label">${esc(label)}</div>
        <div class="metric-value">${valor == null ? '—' : valor}<small>${esc(unidade)}</small></div>
        ${foot ? `<div class="metric-foot">${foot}</div>` : ''}
      </div>
      <span class="metric-icon ${cor}">${ICON[icone] || ICON.info}</span>
    </div>
  </div>`;
}

/** Botão de registo rápido (Atalhos Rápidos do Ecrã 1). */
export function atalho({ icone, texto, valor = '', accao, vivo = false }) {
  return `<button class="quick${vivo ? ' live' : ''}" data-acao="${esc(accao)}">
    <span class="qicon">${ICON[icone] || ICON.mais}</span>
    <span>${esc(texto)}${valor ? ` · <b>${esc(valor)}</b>` : ''}</span>
  </button>`;
}

/** Separadores internos de um módulo (segmented control). */
export function segmentados(atuais, opcoes) {
  return `<div class="segmented" role="tablist">
    ${opcoes.map(o => `<button role="tab" data-sub="${o.id}" aria-selected="${atuais === o.id}">${esc(o.nome)}</button>`).join('')}
  </div>`;
}

/** Linha de lista com ícone e chevron. */
export function linha({ icone = 'info', titulo, sub = '', fim = '', data, cor }) {
  return `<div class="row" ${data ? data : ''}>
    <span class="row-ico"${cor ? ` style="background:${cor}22;color:${cor}"` : ''}>${ICON[icone] || ICON.info}</span>
    <div class="row-main"><div class="row-title">${esc(titulo)}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>
    ${fim ? `<div class="row-end">${fim}</div>` : ''}
  </div>`;
}

export function vazio(texto, sub = '', acaoHTML = '') {
  return `<div class="empty"><strong>${esc(texto)}</strong>${esc(sub)}${acaoHTML ? `<div class="btn-row mt16" style="justify-content:center">${acaoHTML}</div>` : ''}</div>`;
}

/** Origem de um dado (HealthKit / Garmin / manual / clima) em linguagem clara. */
export const ORIGEM_LABEL = {
  healthkit: 'Apple Saúde', garmin: 'Garmin', manual: 'manual', 'open-meteo': 'Open-Meteo', importado: 'importado',
};
export function etiquetaOrigem(o) {
  if (!o) return '';
  return `<span class="badge blue">${esc(ORIGEM_LABEL[o] || o)}</span>`;
}
