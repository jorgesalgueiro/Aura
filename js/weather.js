/* ==========================================================================
   weather.js — clima real via Open-Meteo (sem chave de API)
   Endpoints verificados:
     https://api.open-meteo.com/v1/forecast   (current + hourly, past_days ≤ 92)
     https://archive-api.open-meteo.com/v1/archive   (histórico longo)
     https://geocoding-api.open-meteo.com/v1/search  (busca de localidade)
   ========================================================================== */

import { get, put } from './store.js';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE  = 'https://archive-api.open-meteo.com/v1/archive';
const GEO      = 'https://geocoding-api.open-meteo.com/v1/search';

const TTL_MS = 15 * 60 * 1000;          // 15 min entre atualizações
const chaveSerie = (lat, lon, dias) => `serie|${lat.toFixed(3)}|${lon.toFixed(3)}|${dias}`;

async function json(url) {
  // sem limite, um pedido pendurado deixava o clima "a carregar" para sempre
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('O Open-Meteo não respondeu a tempo.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const fmtDate = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

/**
 * Série horária de pressão e temperatura, com cache em IndexedDB.
 * @returns {Promise<{atual: object|null, serie: Array<{t:string,hpa:number,temp:number}>, cached:boolean}>}
 */
export async function seriePressao({ lat, lon, diasAtras = 30, forcar = false } = {}) {
  const chave = chaveSerie(lat, lon, diasAtras);
  const agora = Date.now();
  const hit = await get('pressaoCache', chave).catch(() => null);

  if (!forcar && hit && (agora - hit.feitoEm) < TTL_MS) {
    return { atual: hit.atual || null, serie: hit.serie, cached: true };
  }

  const agoraDate = new Date();
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'pressure_msl,temperature_2m',
    timezone: 'auto',
    past_days: String(Math.min(92, diasAtras)),
    forecast_days: '1',
    current: 'temperature_2m,pressure_msl,relative_humidity_2m,apparent_temperature',
  });

  /* A previsão só expõe pressão a partir de ~58 dias para trás. Num relatório
     de 90 dias juntamos o arquivo histórico completo e deixamos a previsão
     sobrepor-se nos dias recentes (onde é mais atual). */
  const pedidos = [json(`${FORECAST}?${params}`)];
  if (diasAtras > 45) {
    const inicio = new Date(agoraDate.getTime() - (diasAtras + 1) * 864e5);
    const arquivoParams = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      hourly: 'pressure_msl,temperature_2m',
      timezone: 'auto',
      start_date: fmtDate(inicio),
      end_date: fmtDate(agoraDate),
    });
    pedidos.push(json(`${ARCHIVE}?${arquivoParams}`));
  }

  const respostas = await Promise.allSettled(pedidos);
  let data = null;
  let arquivo = null;
  let erroFetch = null;
  if (respostas[0].status === 'fulfilled') data = respostas[0].value;
  else erroFetch = respostas[0].reason;
  if (respostas[1] && respostas[1].status === 'fulfilled') arquivo = respostas[1].value;

  if (!data && !arquivo) {
    // Offline (ou Open-Meteo indisponível): a última série guardada continua
    // a alimentar o barómetro e os relatórios, mesmo já tendo mais de 15 min.
    if (hit && hit.serie && hit.serie.length) {
      return { atual: hit.atual || null, serie: hit.serie, cached: true, stale: true, erro: erroFetch?.message || 'Sem ligação' };
    }
    throw erroFetch || new Error('Open-Meteo indisponível');
  }

  const normalizar = (d) => {
    const h = d?.hourly || {};
    return (h.time || []).map((t, i) => ({
      t, hpa: h.pressure_msl?.[i] ?? null, temp: h.temperature_2m?.[i] ?? null,
    })).filter(p => p.hpa != null);
  };
  const porHora = new Map();
  for (const p of normalizar(arquivo)) porHora.set(p.t, p);
  for (const p of normalizar(data)) porHora.set(p.t, p);
  const serie = [...porHora.values()].sort((a, b) => a.t.localeCompare(b.t));

  const atual = data?.current ? {
    t: data.current.time,
    hpa: data.current.pressure_msl,
    temp: data.current.temperature_2m,
    humidade: data.current.relative_humidity_2m,
    sensacao: data.current.apparent_temperature,
    fuso: data.timezone_abbreviation,
  } : null;

  await put('pressaoCache', { chave, feitoEm: agora, atual, serie, lat, lon, diasAtras }).catch(() => {});
  return { atual, serie, cached: false };
}

/** Pressão mais próxima de um instante (ISO) e variação nos N horas anteriores. */
export function pressaoEm(serie, quandoISO, janelaH = 6) {
  if (!serie || !serie.length) return { hpa: null, delta: null, serie: null };
  const alvo = new Date(quandoISO).getTime();
  let idx = -1;
  for (let i = 0; i < serie.length; i++) {
    if (new Date(serie[i].t).getTime() <= alvo) idx = i; else break;
  }
  if (idx < 0) idx = 0;
  const hpa = serie[idx].hpa;
  const inicio = serie[Math.max(0, idx - janelaH)];
  return { hpa, delta: +(hpa - inicio.hpa).toFixed(1), serie: serie.slice(Math.max(0, idx - janelaH), idx + 1) };
}

/**
 * Etiqueta de risco meteorológico para enxaqueca.
 * Heurística baseada na literatura de gatilhos: descidas rápidas de pressão.
 * Não é aconselhamento médico.
 */
export function riscoMeteorologico(delta6h, hpa) {
  if (delta6h == null) return { nivel: 'desconhecido', label: 'Sem dados', cor: '' };
  if (delta6h <= -5)  return { nivel: 'elevado',  label: 'Queda acentuada', cor: 'red' };
  if (delta6h <= -2)  return { nivel: 'moderado', label: 'Queda ligeira',   cor: 'amber' };
  if (delta6h >= 4)   return { nivel: 'estavel',  label: 'Subida rápida',   cor: 'blue' };
  return { nivel: 'estavel', label: 'Estável', cor: 'green' };
}

/** Bandas de pressão usadas no relatório de correlação (cf. Ecrã 6 do plano). */
export function bandaPressao(hpa) {
  if (hpa == null) return 'sem';
  if (hpa < 1000) return '<1000 hPa';
  if (hpa < 1008) return '1000–1007 hPa';
  if (hpa < 1016) return '1008–1015 hPa';
  return '≥1016 hPa';
}

export async function geocodar(nome) {
  if (!nome || nome.trim().length < 2) return [];
  const data = await json(`${GEO}?name=${encodeURIComponent(nome.trim())}&count=8&language=pt&format=json`);
  return (data.results || []).map(r => ({
    nome: r.name, distrito: r.admin1 || '', pais: r.country || '',
    lat: r.latitude, lon: r.longitude, fuso: r.timezone,
  }));
}

export function posicaoAtual() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Este dispositivo não suporta geolocalização.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }),
      (e) => reject(new Error(e.code === 1 ? 'Permissão de localização recusada.' : 'Não foi possível obter a localização.')),
      { timeout: 12000, maximumAge: 600000 }
    );
  });
}
