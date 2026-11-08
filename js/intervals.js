/* ==========================================================================
   intervals.js — dados do Garmin no Aura, automaticamente, via Intervals.icu
   --------------------------------------------------------------------------
   O Garmin Connect liga-se ao Intervals.icu uma única vez, no site deles.
   A partir daí o Intervals.icu recebe sono, VFC, passos, peso e atividades e
   expõe-nos numa API com CORS aberto ao origin da app — o que permite a esta
   PWA falar directamente com ele, sem backend e sem OAuth.

   A chave pessoal vive em IndexedDB (meta → `intervals`) e só é enviada para
   `intervals.icu`. Fica de fora das cópias de segurança exportadas pela app.

   Regra de ouro do sync: preencher só o que está vazio. Um valor escrito à mão
   (ou vindo do Apple Saúde) nunca é substituído; só se atualiza o que veio de
   uma sincronização anterior do Garmin.
   ========================================================================== */

import { get, put, getDia, patchDia, diaKey, isoOf } from './store.js';
import { toast } from './utils.js';

const API = 'https://intervals.icu/api/v1';
const META = 'intervals';
const MINUTOS_ENTRE_SYNC = 20;

/** Estado vivo, observável pela UI (folha de Definições). */
export const sync = {
  estado: 'desligado',   // desligado | pronto | a-sincronizar | ok | erro
  erro: null,
  feitoEm: null,         // quando terminou a última tentativa
  ultimaSync: null,      // ISO da última sincronização bem-sucedida
  resumo: null,
  aCarregar: false,
};

const subs = new Set();
export function observarSync(fn) { subs.add(fn); return () => subs.delete(fn); }
const notificar = () => subs.forEach(f => f(sync));

/* -------------------------------------------------------------- ligação -- */

let _conf = null;

export async function ligacao() {
  if (!_conf) {
    const row = await get('meta', META).catch(() => null);
    _conf = Object.assign(
      { ativo: false, athleteId: '0', chave: '', ultimaSync: null, ultimoErro: null },
      (row && row.v) || {},
    );
    if (_conf.ativo && _conf.chave) {
      if (sync.estado === 'desligado') sync.estado = 'pronto';
      sync.ultimaSync = _conf.ultimaSync;
    }
  }
  return _conf;
}

async function guardarConfig(conf) {
  _conf = conf;
  await put('meta', { k: META, v: conf });
  sync.ultimaSync = conf.ultimaSync;
  notificar();
  return conf;
}

/** Texto pronto para a UI. Exige `ligacao()` antes (a folha já o faz). */
export function estadoGarmin() {
  if (sync.aCarregar) return { ligado: true, texto: 'a sincronizar com o Garmin…', classe: 'blue' };
  if (sync.estado === 'erro') return { ligado: true, texto: sync.erro, classe: 'red' };
  const c = _conf;
  if (!c || !c.ativo || !c.chave) {
    return { ligado: false, texto: 'Sem ligação — o sono, a VFC, os passos e o peso entram por importação manual.', classe: '' };
  }
  if (!c.ultimaSync) return { ligado: true, texto: 'Ligado · à espera da primeira sincronização', classe: 'green' };
  const hora = new Date(c.ultimaSync).toLocaleString('pt-PT', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const r = sync.resumo;
  const extra = r
    ? (r.dias ? ` · ${r.dias} dia${r.dias > 1 ? 's' : ''} atualizado${r.dias > 1 ? 's' : ''}` : ' · já estava tudo atualizado')
    : '';
  return { ligado: true, texto: `Ligado · última sincronização ${hora}${extra}`, classe: 'green' };
}

/* ------------------------------------------------------------- pedidos --- */

const LIMPAR_CHAVE = (s) => String(s || '').trim().replace(/\s+/g, '');

async function pedir(conf, caminho) {
  // um pedido pendurado bloquearia a sincronização para sempre (aCarregar)
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(API + caminho, {
      headers: {
        Authorization: 'Basic ' + btoa(`API_KEY:${conf.chave}`),
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    });
    if (r.status === 401) throw new Error('Chave recusada. Gere outra em intervals.icu → Definições → Developer Settings.');
    if (r.status === 403) throw new Error('A chave não tem acesso a este atleta. Confirme o ID (0 usa a conta da chave).');
    if (r.status === 429) {
      const s = Number(r.headers.get('Retry-After'));
      const min = Number.isFinite(s) && s > 0 ? Math.ceil(s / 60) : 5;
      throw new Error(`Limite de pedidos do Intervals.icu atingido. Tente daqui a ${min} min.`);
    }
    if (!r.ok) throw new Error(`O Intervals.icu respondeu ${r.status}.`);
    return await r.json();
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('O Intervals.icu não respondeu a tempo. Tente de novo.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Confirma a chave e devolve o nome do atleta + o último dia de wellness. */
export async function testar(conf) {
  const c = conf || await ligacao();
  const hoje = diaKey();
  const [regs, perfil] = await Promise.all([
    pedir(c, `/athlete/${c.athleteId}/wellness?oldest=${hoje}&newest=${hoje}`),
    pedir(c, `/athlete/${c.athleteId}/profile`).catch(() => null),
  ]);
  const lista = Array.isArray(regs) ? regs : [];
  return {
    nome: (perfil && (perfil.name || perfil.athleteName)) || null,
    dias: lista.length,
    registo: lista[0] || null,
  };
}

/** Guarda a chave só depois de ela provar que funciona. */
export async function ligar({ athleteId, chave }) {
  const k = LIMPAR_CHAVE(chave);
  if (!/^[A-Za-z0-9_-]{8,}$/.test(k)) {
    throw new Error('A chave da API parece inválida (mínimo 8 letras ou números, sem espaços).');
  }
  const id = String(athleteId || '0').trim().toLowerCase() || '0';
  // o Intervals.icu aceita 0 (a conta da chave), o id numérico ou o id com
  // prefixo "i" que aparece no site (ex.: i85346)
  if (!/^(?:0|i?\d+)$/.test(id)) {
    throw new Error('O ID de atleta é numérico ou tem o formato i12345 — use 0 para a conta da chave.');
  }

  const conf = { ativo: true, athleteId: id, chave: k, ultimaSync: null, ultimoErro: null };
  const teste = await testar(conf);
  await guardarConfig(conf);
  const resumo = await sincronizar({ dias: 30, forcar: true });
  return Object.assign({}, teste, { resumo });
}

export async function desligar() {
  const c = await ligacao();
  await guardarConfig(Object.assign({}, c, { ativo: false, chave: '', ultimoErro: null }));
  Object.assign(sync, { estado: 'desligado', erro: null, resumo: null });
  notificar();
}

/* ------------------------------------------------------------ sincronizar */

const preenchido = (v) => v != null && v !== '' && !(Number(v) === 0);

/** Só escreve onde não há nada, ou onde a origem já era uma sincronização. */
const podeEscrever = (dia, campo) =>
  !preenchido(dia[campo]) || (dia.origem || {})[campo] === 'garmin';

/**
 * Vai buscar os últimos `dias` dias ao Intervals.icu e grava o que faltar.
 * Silenciosa por omissão (é chamada no arranque); devolve o resumo ou null.
 */
export async function sincronizar({ dias = 7, forcar = false, silencioso = true } = {}) {
  const conf = await ligacao();
  if (!conf.ativo || !conf.chave) { sync.estado = 'desligado'; notificar(); return null; }
  if (sync.aCarregar) return null;

  const desdeMs = conf.ultimaTentativa ? Date.now() - new Date(conf.ultimaTentativa).getTime() : Infinity;
  if (!forcar && desdeMs < MINUTOS_ENTRE_SYNC * 6e4) return null;

  sync.aCarregar = true;
  sync.estado = 'a-sincronizar';
  sync.erro = null;
  notificar();

  try {
    const resumo = await recolher(conf, dias);
    const agora = isoOf();
    await guardarConfig(Object.assign({}, conf, {
      ultimaSync: agora, ultimaTentativa: agora, ultimoErro: null,
    }));
    Object.assign(sync, { estado: 'ok', erro: null, feitoEm: new Date(), resumo });
    return resumo;
  } catch (e) {
    const msg = (e && e.message) || String(e);
    await guardarConfig(Object.assign({}, conf, { ultimaTentativa: isoOf(), ultimoErro: msg })).catch(() => {});
    Object.assign(sync, { estado: 'erro', erro: msg, feitoEm: new Date(), resumo: null });
    if (!silencioso) throw e;
    return null;
  } finally {
    sync.aCarregar = false;
    notificar();
  }
}

async function recolher(conf, dias) {
  const hoje = diaKey();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - Math.max(0, dias - 1));
  const desde = diaKey(inicio);

  const [wellness, atividades] = await Promise.all([
    pedir(conf, `/athlete/${conf.athleteId}/wellness?oldest=${desde}&newest=${hoje}`),
    // as atividades só servem para as calorias: se falharem, o resto segue
    pedir(conf, `/athlete/${conf.athleteId}/activities?oldest=${desde}&newest=${hoje}`).catch(() => []),
  ]);

  const porDia = new Map();
  for (const w of Array.isArray(wellness) ? wellness : []) {
    if (w && /^\d{4}-\d{2}-\d{2}$/.test(w.id || '')) porDia.set(w.id, w);
  }

  const kcal = Object.create(null);
  for (const a of Array.isArray(atividades) ? atividades : []) {
    const chave = String(a.start_date_local || a.start_date || '').slice(0, 10);
    const v = Number(a.calories);
    if (!chave || !(v > 0)) continue;
    kcal[chave] = (kcal[chave] || 0) + v;
  }

  const diasEscrever = new Set([...porDia.keys(), ...Object.keys(kcal)]);
  const escritos = [];
  const campos = new Set();

  for (const chave of diasEscrever) {
    const w = porDia.get(chave) || {};
    const patch = {};

    const segundos = Number(w.sleepSecs);
    if (segundos > 0) {
      const horas = +(segundos / 3600).toFixed(2);
      if (horas >= 1 && horas <= 16) patch.sonoHoras = horas;
    }

    // `hrv` é o valor que o Garmin exporta para treino (rMSSD); `hrvSDNN` é o SDNN
    const hrv = Number(w.hrv) > 0 ? Number(w.hrv) : Number(w.hrvSDNN);
    if (hrv > 0 && hrv < 400) patch.hrvMs = Math.round(hrv);

    const passos = Number(w.steps);
    if (passos > 0) patch.passos = Math.round(passos);

    const peso = Number(w.weight);
    if (peso > 20 && peso < 400) patch.pesoKg = +peso.toFixed(2);

    const c = kcal[chave];
    if (c > 0) patch.kcalAtivas = Math.round(c);

    if (!Object.keys(patch).length) continue;

    const atual = await getDia(chave);
    const escolhidos = {};
    for (const [campo, valor] of Object.entries(patch)) {
      if (podeEscrever(atual, campo)) escolhidos[campo] = valor;
    }
    if (!Object.keys(escolhidos).length) continue;

    await patchDia(chave, Object.assign({ __src: 'garmin' }, escolhidos));
    escritos.push({ dia: chave, campos: Object.keys(escolhidos) });
    Object.keys(escolhidos).forEach(c2 => campos.add(c2));
  }

  return {
    desde, ate: hoje,
    dias: escritos.length,
    diasComDados: porDia.size,
    campos: [...campos],
    ultimos: escritos.slice(-3),
  };
}

/**
 * Versão para botões: sincroniza, informa por toast e devolve o resumo.
 * Usada pelas Definições e pelo atalho do dashboard.
 */
export async function sincronizarAgora({ dias = 30 } = {}) {
  if (sync.aCarregar) {
    toast('Já há uma sincronização em curso. Aguarde uns segundos.', 'warn', 4000);
    return null;
  }
  const conf = await ligacao();
  if (!conf.ativo || !conf.chave) {
    toast('O Garmin não está ligado.', 'warn');
    return null;
  }
  try {
    const r = await sincronizar({ dias, forcar: true, silencioso: false });
    // sem dados e sem erro significa que outra sincronização arrancou entretanto
    if (!r) { toast('A sincronização não avançou. Tente de novo.', 'warn'); return null; }
    if (r.dias) toast(`${r.dias} dia${r.dias > 1 ? 's' : ''} atualizado${r.dias > 1 ? 's' : ''}`);
    else toast('Já estava tudo atualizado');
    return r;
  } catch (e) {
    toast((e && e.message) || 'Falha na sincronização', 'err', 6000);
    return null;
  }
}
