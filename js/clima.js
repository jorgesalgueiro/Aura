/* ==========================================================================
   clima.js — estado partilhado do clima real (Open-Meteo) para todos os ecrãs
   ========================================================================== */

import { seriePressao, pressaoEm, riscoMeteorologico, bandaPressao } from './weather.js';
import { settings, diaKey } from './store.js';

/** @type {{atual:?object, serie:object[], delta6h:?number, risco:object, erro:?string, feitoEm:?Date}} */
export const clima = {
  atual: null, serie: [], delta6h: null,
  risco: { nivel: 'desconhecido', label: 'A consultar…', cor: '' },
  erro: null, feitoEm: null, aCarregar: false,
};

const subs = new Set();
export function observarClima(fn) { subs.add(fn); return () => subs.delete(fn); }
const notificar = () => subs.forEach(f => f(clima));

/**
 * Vai buscar a série de pressão dos últimos `diasAtras` dias (15 min de cache).
 * @returns {Promise<typeof clima>}
 */
export async function atualizarClima({ diasAtras = 45, forcar = false } = {}) {
  if (clima.aCarregar) return clima;
  clima.aCarregar = true; notificar();
  try {
    const s = await settings();
    const r = await seriePressao({ lat: s.lat, lon: s.lon, diasAtras, forcar });
    clima.serie = r.serie || [];
    clima.atual = r.atual || (clima.serie.length ? clima.serie.at(-1) : null);
    clima.delta6h = clima.serie.length ? pressaoEm(clima.serie, new Date().toISOString(), 6).delta : null;
    clima.risco = riscoMeteorologico(clima.delta6h, clima.atual && clima.atual.hpa);
    clima.banda = bandaPressao(clima.atual && clima.atual.hpa);
    clima.erro = r.stale ? 'Sem ligação — a usar a última leitura guardada.' : null;
    clima.feitoEm = new Date();
    clima.cached = !!r.cached;
  } catch (e) {
    clima.erro = e && e.message ? e.message : 'Sem ligação: a usar dados guardados.';
    if (!clima.serie.length) clima.risco = { nivel: 'desconhecido', label: 'Sem dados', cor: '' };
  } finally {
    clima.aCarregar = false;
    notificar();
  }
  return clima;
}

/** Pressão média por dia (AAAA-MM-DD → hPa) a partir da série horária. */
export function pressaoMediaDiaria(serie = clima.serie) {
  const soma = Object.create(null);
  for (const p of serie || []) {
    const d = String(p.t).slice(0, 10);
    if (p.hpa == null) continue;
    (soma[d] ||= { s: 0, n: 0 });
    soma[d].s += p.hpa; soma[d].n += 1;
  }
  const out = {};
  for (const [d, v] of Object.entries(soma)) out[d] = +(v.s / v.n).toFixed(1);
  return out;
}

/** Últimas N horas de pressão para o sparkline do dashboard. */
export function ultimasHoras(n = 24) {
  return (clima.serie || []).slice(-n).map(p => p.hpa);
}

/** Etiqueta curta do estado do clima para o pill do topo. */
export function estadoPill() {
  if (clima.aCarregar) return { txt: 'a sincronizar…', cls: '' };
  if (clima.erro && !clima.serie.length) return { txt: 'clima offline', cls: 'err' };
  const h = clima.atual ? `${Math.round(clima.atual.hpa)} hPa` : '—';
  const t = clima.atual && clima.atual.temp != null ? `${Math.round(clima.atual.temp)}° · ` : '';
  const hora = clima.feitoEm
    ? `${String(clima.feitoEm.getHours()).padStart(2, '0')}:${String(clima.feitoEm.getMinutes()).padStart(2, '0')}`
    : '';
  return { txt: `${t}${h} · ${clima.risco.label}${hora ? ' · ' + hora : ''}`, cls: clima.erro ? 'warn' : 'ok' };
}
