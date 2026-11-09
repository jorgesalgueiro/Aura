/* ==========================================================================
   store.js — camada de dados local (espelho do esquema SwiftData do plano)
   Entidades: RegistoDiario, RegistoEnxaqueca, RegistoFezes, ItemMedicacao,
              TomaMedicacao, Refeicao, PressaoCache, Meta
   ========================================================================== */

const DB_NAME = 'aura-health-journal';
const DB_VERSION = 2;

/** @type {IDBDatabase|null} */
let _db = null;
let _opening = null;

const STORES = {
  registoDiario:   { key: 'data',   indexes: [] },
  registoEnxaqueca:{ key: 'id',     indexes: ['data'] },
  registoFezes:    { key: 'id',     indexes: ['data'] },
  itemMedicacao:   { key: 'id',     indexes: [] },
  tomaMedicacao:   { key: 'id',     indexes: ['data', 'itemId'] },
  refeicao:        { key: 'id',     indexes: ['data'] },
  alimentoCache:   { key: 'codigo', indexes: [] },
  alimentoCustom:  { key: 'id',     indexes: [] },
  pressaoCache:    { key: 'chave',  indexes: [] },
  meta:            { key: 'k',      indexes: [] },
};

export function openDB() {
  if (_db) return Promise.resolve(_db);
  if (_opening) return _opening;
  _opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        let os;
        if (!db.objectStoreNames.contains(name)) {
          os = db.createObjectStore(name, { keyPath: def.key });
        } else {
          os = req.transaction.objectStore(name);
        }
        for (const idx of def.indexes) {
          if (!os.indexNames.contains(idx)) os.createIndex(idx, idx);
        }
      }
    };
    req.onsuccess = () => { _db = req.result; _opening = null; resolve(_db); };
    req.onerror = () => { _opening = null; reject(req.error); };
    // sem limpar _opening, a promessa rejeitada ficaria em cache até recarregar
    req.onblocked = () => { _opening = null; reject(new Error('IndexedDB bloqueado: feche outros separadores da app.')); };
  });
  return _opening;
}

function tx(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let out;
    try { out = fn(os); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && out.__req ? out.__req.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transação abortada'));
  }));
}

const wrap = (req) => ({ __req: req });

export const get   = (store, key)        => tx(store, 'readonly',  os => wrap(os.get(key)));
export const all   = (store)             => tx(store, 'readonly',  os => wrap(os.getAll()));
export const byIdx = (store, idx, q)     => tx(store, 'readonly',  os => wrap(os.index(idx).getAll(q)));
export const put   = (store, value)      => tx(store, 'readwrite', os => os.put(value));
export const del   = (store, key)        => tx(store, 'readwrite', os => os.delete(key));
export const clear = (store)             => tx(store, 'readwrite', os => os.clear());
export const count = (store)             => tx(store, 'readonly',  os => wrap(os.count()));

/* ---------------------------------------------------------------- utils -- */

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 9));

/** Chave de dia no fuso local: "AAAA-MM-DD" */
export function dayKey(d = new Date()) {
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const k = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${k}`;
}

/** Alias pt-PT usado pelos ecrãs. */
export const diaKey = dayKey;

export const hourKey = (d = new Date()) => String((d instanceof Date ? d : new Date(d)).getHours()).padStart(2, '0');
export const isoOf   = (d = new Date()) => (d instanceof Date ? d : new Date(d)).toISOString();
export const hhmm    = (d) => isoOf(d).slice(11, 16);

/** "Agora há 1 h 20 min" */
export function desde(horaISO) {
  const ms = Date.now() - new Date(horaISO).getTime();
  if (ms < 45e3) return 'agora mesmo';
  const min = Math.round(ms / 6e4);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h ${String(min % 60).padStart(2, '0')} min`;
  const dias = Math.floor(h / 24);
  return `há ${dias} d`;
}

export function duracao(inicioISO, fimISO) {
  const ms = new Date(fimISO || Date.now()) - new Date(inicioISO);
  const min = Math.max(0, Math.round(ms / 6e4));
  const h = Math.floor(min / 60);
  return h >= 1 ? `${h} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`;
}

/* ------------------------------------------------------------ settings -- */

export const DEFAULT_SETTINGS = {
  nome: '',
  localidade: 'Lisboa',
  lat: 38.7223,
  lon: -9.1393,
  objetivoAguaMl: 2000,
  incrementoAguaMl: 250,
  unidades: 'metric',
  haptics: true,
  instalarOculto: false,      // o cartão "instalar no ecrã principal" foi dispensado
  ultimaCopia: null,          // ISO da última cópia exportada (JSON ou .aura)
  copiaAdiada: null,          // ISO até quando o aviso de cópia fica escondido
  importadoDe: null,          // { origem, data, contagem }
};

let _settings = null;
export async function settings() {
  if (_settings) return _settings;
  const row = await get('meta', 'settings').catch(() => null);
  _settings = Object.assign({}, DEFAULT_SETTINGS, (row && row.v) || {});
  return _settings;
}
/** Espelho síncrono para decisões imediatas (ex.: háptica) que não podem esperar. */
export const settingsCache = () => _settings;
export async function saveSettings(patch) {
  const next = Object.assign(await settings(), patch);
  _settings = next;
  await put('meta', { k: 'settings', v: next });
  return next;
}

/* ------------------------------------------------------- RegistoDiario -- */

const DIA_BLANCO = (data) => ({
  data, pesoKg: null, aguaMl: 0, tempC: null, pressaoHpa: null,
  stress: null, energia: null, notas: '', doencas: [], afrontamentos: [],
  sonoHoras: null, sonoProfundoMin: null, sonoREMmin: null, sonoLeveMin: null,
  hrvMs: null, passos: null, kcalAtivas: null,
  origem: {},   // { campo: 'healthkit'|'garmin'|'manual'|'open-meteo' }
  atualizado: null,
});

export async function getDia(data) {
  return (await get('registoDiario', data)) || DIA_BLANCO(data);
}

export async function patchDia(data, patch) {
  const atual = await getDia(data);
  const next = Object.assign({}, atual, patch, {
    origem: Object.assign({}, atual.origem || {}, Object.fromEntries(
      Object.keys(patch)
        .filter(k => !['origem', 'atualizado', 'data', '__src'].includes(k))
        .map(k => [k, patch.__src || 'manual'])
    )),
    atualizado: isoOf(),
  });
  delete next.__src;
  await put('registoDiario', next);
  return next;
}

export const dias = (n = 30, ate = new Date()) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(ate); d.setDate(d.getDate() - (n - 1 - i)); return dayKey(d);
  });

export async function diasComDados(chaves) {
  const resultados = await Promise.all(chaves.map(k => get('registoDiario', k)));
  return resultados.filter(Boolean);
}

/* -------------------------------------------------- RegistoEnxaqueca --- */

export const ZONAS_CABECA = [
  { id: 'frontal',        nome: 'Frontal' },
  { id: 'lateral_esq',    nome: 'Lateral Esquerda' },
  { id: 'lateral_dir',    nome: 'Lateral Direita' },
  { id: 'occipital',      nome: 'Occipital' },
  { id: 'ocular',         nome: 'Ocular' },
];

export const GATILHOS = [
  'Queda de pressão', 'Calor', 'Frio', 'Vento', 'Humidade',
  'Pouco sono', 'Excesso de sono', 'Stress', 'Desidratação', 'Jejum',
  'Cafeína', 'Álcool', 'Esforço físico', 'Luz forte', 'Ecrãs',
  'Cheiros fortes', 'Alteração hormonal', 'Alimentos curados',
];

export async function crises(doUltimosDias = 90) {
  const limite = new Date(); limite.setDate(limite.getDate() - doUltimosDias);
  limite.setHours(0, 0, 0, 0);
  const todas = await all('registoEnxaqueca');
  return todas
    .filter(c => new Date(c.dataInicio) >= limite)
    .sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));
}

export async function criseAtiva() {
  const todas = await all('registoEnxaqueca');
  return todas.find(c => !c.dataFim) || null;
}

export async function iniciarCrise({ zonas = [], intensidade = 5, gatilhos = [], notas = '' } = {}) {
  const existente = await criseAtiva();
  if (existente) return existente;
  const agora = new Date();
  const c = {
    id: uid(),
    dataInicio: isoOf(agora),
    data: dayKey(agora),
    dataFim: null,
    zonas, intensidade, gatilhos, notas,
    tomaMedicacaoIds: [],
    pressaoInicioHpa: null,
    deltaPressao6hHpa: null,
    tempoAntesMin: null,
  };
  await put('registoEnxaqueca', c);
  return c;
}

export async function terminarCrise(id, extra = {}) {
  const c = await get('registoEnxaqueca', id);
  if (!c) return null;
  const agora = new Date();
  c.dataFim = isoOf(agora);
  c.tempoAntesMin = Math.round((agora - new Date(c.dataInicio)) / 6e4);
  Object.assign(c, extra);
  await put('registoEnxaqueca', c);
  return c;
}

export async function updateCrise(id, patch) {
  const c = await get('registoEnxaqueca', id);
  if (!c) return null;
  Object.assign(c, patch);
  await put('registoEnxaqueca', c);
  return c;
}

/* ------------------------------------------------------- RegistoFezes -- */

/** Etiquetas de doenças pontuais (Ecrã 3 do plano). */
export const DOENCAS = ['Gripe', 'Dores de Costas', 'Febre', 'Cansaço Extremo', 'Náuseas', 'Tontura', 'Insónia', 'Alergia'];

export const BRISTOL = [
  { tipo: 1, nome: 'Bolas duras',           curto: 'Bolas duras',   grupo: 'Obstipação', cor: '#fbbf24',
    desc: 'Pequenas bolas duras e separadas, como caroços. Difícil de passar.' },
  { tipo: 2, nome: 'Salsicha granulosa',    curto: 'Granulosa',     grupo: 'Obstipação', cor: '#fbbf24',
    desc: 'Forma de salsicha, mas com caroços e superfície irregular.' },
  { tipo: 3, nome: 'Salsicha com fissuras', curto: 'Com fissuras',  grupo: 'Normal',     cor: '#34d399',
    desc: 'Salsicha firme, com rachas à superfície.' },
  { tipo: 4, nome: 'Salsicha lisa',         curto: 'Lisa',          grupo: 'Normal',     cor: '#34d399',
    desc: 'Lisa, macia e contínua. É o aspeto mais habitual.' },
  { tipo: 5, nome: 'Pedaços macios',        curto: 'Pedaços macios', grupo: 'Solto',     cor: '#38bdf8',
    desc: 'Pedaços moles com bordas definidas; passam facilmente.' },
  { tipo: 6, nome: 'Mole e pastoso',        curto: 'Pastoso',       grupo: 'Diarreia',   cor: '#f87171',
    desc: 'Pedaços fofos com bordas irregulares; consistência pastosa.' },
  { tipo: 7, nome: 'Líquido',               curto: 'Líquido',       grupo: 'Diarreia',   cor: '#f87171',
    desc: 'Aquoso, sem pedaços sólidos.' },
];

export async function registosFezes(doUltimosDias = 90) {
  const limite = new Date(); limite.setDate(limite.getDate() - doUltimosDias);
  const rs = await all('registoFezes');
  return rs.filter(r => new Date(r.hora) >= limite).sort((a, b) => new Date(b.hora) - new Date(a.hora));
}

export async function adicionarFezes({ tipo, hemorroides = null, quando = new Date() }) {
  const r = {
    id: uid(),
    hora: isoOf(quando),
    data: dayKey(quando),
    tipo,
    hemorroides,   // { desconforto:0-10, sangramento:bool, fatores:[] } | null
  };
  await put('registoFezes', r);
  return r;
}

/** Afrontamento (calor súbito) no dia escolhido, com intensidade 1–10. */
export async function adicionarAfrontamento({ intensidade = 3, notas = '', quando = new Date() } = {}) {
  const data = dayKey(quando);
  const dia = await getDia(data);
  const registo = {
    id: uid(), hora: hhmm(quando), quando: isoOf(quando),
    intensidade: Math.max(1, Math.min(10, Math.round(intensidade))), notas: String(notas || '').trim(),
  };
  await patchDia(data, { afrontamentos: [...(dia.afrontamentos || []), registo] });
  return registo;
}

export async function removerAfrontamento(data, id) {
  const dia = await getDia(data);
  const lista = (dia.afrontamentos || []).filter(a => a.id !== id);
  await patchDia(data, { afrontamentos: lista });
  return lista;
}

/* ------------------------------------------------------ ItemMedicacao -- */

export const CATEGORIAS = { medicamento: 'Medicamento', suplemento: 'Suplemento' };

/**
 * Sugestões iniciais de medicação aguda para enxaqueca. São apenas pontos de
 * partida editáveis: a dose e a indicação têm de ser confirmadas com o médico
 * ou farmacêutico. Não têm horários fixos (são de uso SOS).
 */
export const MEDICACAO_ENXAQUECA = [
  { nome: 'Aspirina', dosagem: '1000 mg' },
  { nome: 'Aspegic', dosagem: '1000 mg' },
  { nome: 'Zolmitriptano', dosagem: '5 mg' },
  { nome: 'Naproxeno', dosagem: '500 mg' },
  { nome: 'Ibuprofeno', dosagem: '400 mg' },
  { nome: 'Paracetamol', dosagem: '1000 mg' },
  { nome: 'Sumatriptano', dosagem: '50 mg' },
  { nome: 'Eletriptano', dosagem: '40 mg' },
  { nome: 'Rizatriptano', dosagem: '10 mg' },
  { nome: 'Metoclopramida', dosagem: '10 mg' },
  { nome: 'Domperidona', dosagem: '10 mg' },
  { nome: 'Diclofenac', dosagem: '50 mg' },
];

const CHAVE_MEDICACAO = 'medicacaoEnxaquecaSemeada';

/**
 * Adiciona uma única vez as sugestões que ainda não existam na farmácia.
 * Nunca repõe itens que a pessoa tenha apagado (a marca fica em `meta`).
 */
export async function semearMedicacaoComum() {
  const feito = await get('meta', CHAVE_MEDICACAO).catch(() => null);
  if (feito) return 0;
  const existentes = await all('itemMedicacao').catch(() => []);
  const nomes = new Set(existentes.map(i => String(i.nome || '').trim().toLocaleLowerCase('pt')));
  let n = 0;
  for (const m of MEDICACAO_ENXAQUECA) {
    if (nomes.has(m.nome.toLocaleLowerCase('pt'))) continue;
    await put('itemMedicacao', {
      id: uid(),
      nome: m.nome,
      dosagem: m.dosagem,
      categoria: 'medicamento',
      tomarAs: [],
      ativo: true,
      sos: true,
      sugerido: true,
      criado: isoOf(),
    });
    n++;
  }
  await put('meta', { k: CHAVE_MEDICACAO, v: isoOf() });
  return n;
}

export async function farmacia() {
  const it = await all('itemMedicacao');
  return it.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt'));
}

export async function salvarItem(item) {
  const base = (item && item.id) ? (await get('itemMedicacao', item.id)) : null;
  const novo = Object.assign(
    { id: uid(), nome: '', dosagem: '', categoria: 'medicamento', tomarAs: [], ativo: true },
    base || {}, item || {}
  );
  await put('itemMedicacao', novo);
  return novo;
}

export const apagarItem = (id) => del('itemMedicacao', id);

/** Regista (ou retira) a toma de um item numa hora. Um clique = uma toma. */
export async function toggleToma(itemId, quando = new Date()) {
  const data = dayKey(quando);
  const existentes = await byIdx('tomaMedicacao', 'data', IDBKeyRange.bound(data, data + '\uffff'));
  const hora = hhmm(quando);
  const match = existentes.find(t => t.itemId === itemId && t.hora === hora);
  if (match) { await del('tomaMedicacao', match.id); return { tomado: false, toma: null }; }
  const toma = { id: uid(), itemId, data, hora, quando: isoOf(quando) };
  await put('tomaMedicacao', toma);
  return { tomado: true, toma };
}

export async function tomasDoDia(data = dayKey()) {
  const rows = await byIdx('tomaMedicacao', 'data', IDBKeyRange.bound(data, data + '\uffff'));
  return rows.sort((a, b) => a.hora.localeCompare(b.hora));
}

/* ----------------------------------------------------------- Refeicao -- */

export async function adicionarRefeicao({ texto, calorias = null, fotos = [], itens = [], quando = new Date() }) {
  const lista = Array.isArray(itens) ? itens : [];
  // com alimentos estruturados, o total é sempre a soma deles
  const total = lista.length
    ? Math.round(lista.reduce((a, i) => a + (Number(i.kcal) || 0), 0))
    : (calorias != null ? Math.round(Number(calorias)) : null);
  const r = {
    id: uid(),
    quando: isoOf(quando),
    data: dayKey(quando),
    hora: hhmm(quando),
    texto: texto || lista.map(i => i.nome).filter(Boolean).join(', '),
    calorias: total,
    fotos,
    itens: lista,
  };
  await put('refeicao', r);
  return r;
}

export async function apagarRefeicao(id) {
  await del('refeicao', id);
}

export async function refeicoes(doUltimosDias = 90) {
  const limite = new Date(); limite.setDate(limite.getDate() - doUltimosDias);
  const rs = await all('refeicao');
  return rs.filter(r => new Date(r.quando) >= limite).sort((a, b) => new Date(b.quando) - new Date(a.quando));
}

/* ------------------------------------------------- backup / restauro -- */

export async function exportarTudo() {
  const out = { app: 'Aura Health Journal', versao: DB_VERSION, exportadoEm: isoOf(), dados: {} };
  for (const name of Object.keys(STORES)) {
    // a cache de produtos é descartável e pode ser grande: não vai na cópia
    if (name === 'alimentoCache') continue;
    const rows = await all(name);
    // a chave da API do Intervals.icu é uma credencial: não sai no ficheiro
    out.dados[name] = name === 'meta' ? rows.filter(r => r.k !== 'intervals') : rows;
  }
  return out;
}

export async function importarTudo(payload, { substituir = true } = {}) {
  if (!payload || !payload.dados) throw new Error('Ficheiro inválido.');
  // A chave do Intervals.icu é uma credencial deste aparelho, nunca vai numa
  // cópia: restaurar não deve desligar o Garmin de quem já o tinha ligado.
  const credencial = substituir ? await get('meta', 'intervals').catch(() => null) : null;
  if (substituir) for (const name of Object.keys(STORES)) await clear(name);
  let n = 0;
  for (const [name, rows] of Object.entries(payload.dados)) {
    if (!STORES[name] || !Array.isArray(rows)) continue;
    for (const row of rows) { await put(name, row); n++; }
  }
  if (credencial) await put('meta', credencial);
  _settings = null;
  return n;
}

export async function limparDadosPessoais() {
  // A base de medicação fica: apagar "os registos" é apagar o diário, não a lista
  // de medicamentos que a pessoa configurou (o texto da confirmação promete-o).
  for (const name of ['registoDiario', 'registoEnxaqueca', 'registoFezes', 'tomaMedicacao', 'refeicao']) {
    await clear(name);
  }
}
