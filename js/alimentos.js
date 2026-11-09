/* ==========================================================================
   alimentos.js — calorias com Open Food Facts, cache local e alimentos extra
   --------------------------------------------------------------------------
   · Produto por código de barras: API v2 do Open Food Facts (sem chave).
   · Pesquisa por nome: API v2 de pesquisa, com resultados locais primeiro.
   · A cache em IndexedDB permite voltar a usar um produto sem rede.
   · Alimentos personalizados ficam guardados no dispositivo e nunca saem
     nas cópias de segurança automáticas (são dados do utilizador, por isso
     entram no JSON exportado, mas a cache de produtos não).
   Os valores do Open Food Facts são colaborativos: a UI mostra sempre a
   fonte e permite corrigir a quantidade ou introduzir calorias à mão.
   ========================================================================== */

import { get, put, all, del, uid } from './store.js';
import { ALIMENTOS_COMUNS } from './alimentos-comuns.js';

const API = 'https://world.openfoodfacts.org';
const CAMPOS = 'code,product_name,product_name_pt,generic_name,brands,quantity,serving_size,serving_quantity,product_quantity,product_quantity_unit,nutriments';
const TTL = 30 * 864e5;                 // 30 dias de cache
const limpar = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const fonteNome = (fonte) => ({
  off: 'Open Food Facts', comum: 'Tabela local (aprox.)', custom: 'Personalizado',
}[fonte] || 'Guardado');

/** 8–14 dígitos: EAN-8, UPC-A, EAN-13, ITF-14. */
export function normalizarCodigo(codigo) {
  const d = String(codigo || '').replace(/\D/g, '');
  return d.length >= 8 && d.length <= 14 ? d : null;
}

function unidadeDe(p) {
  const u = String(p.product_quantity_unit || '').toLowerCase();
  if (u === 'ml' || u === 'cl' || u === 'l') return 'ml';
  if (u === 'g' || u === 'kg') return 'g';
  const q = String(p.quantity || '').toLowerCase();
  if (/\d\s*(ml|cl|l)\b/.test(q)) return 'ml';
  return 'g';
}

function kcal100De(n, p, unidade) {
  const base = unidade === 'ml' ? '100ml' : '100g';
  const direto = num(n[`energy-kcal_${base}`]) ?? num(n['energy-kcal_100g']);
  if (direto != null) return direto;
  const kj = num(n[`energy-kj_${base}`]) ?? num(n['energy-kj_100g']) ?? num(n.energy_100g);
  if (kj != null) return kj / 4.184;
  const serv = num(n['energy-kcal_serving']);
  const dose = num(p.serving_quantity);
  if (serv != null && dose) return (serv / dose) * 100;
  return null;
}

function doseDe(p) {
  const d = num(p.serving_quantity);
  if (d != null && d > 0 && d <= 5000) return d;
  const m = String(p.serving_size || '').match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i);
  if (m) {
    const v = num(m[1]);
    if (v && v > 0 && v <= 5000) return v;
  }
  return null;
}

function nomeDe(p) {
  return limpar(p.product_name_pt || p.product_name || p.generic_name);
}

function marcaDe(p) {
  return limpar(String(p.brands || '').split(',')[0]);
}

/** Converte a resposta do Open Food Facts num produto utilizável pela app. */
function produtoDeOFF(p) {
  const nome = nomeDe(p);
  if (!nome) return null;
  const unidade = unidadeDe(p);
  const kcal100 = kcal100De(p.nutriments || {}, p, unidade);
  if (kcal100 == null || !Number.isFinite(kcal100) || kcal100 < 0 || kcal100 > 1000) return null;
  return {
    codigo: String(p.code || '').trim(),
    nome,
    marca: marcaDe(p),
    unidade,
    kcal100: Math.round(kcal100 * 10) / 10,
    dose: doseDe(p),
    fonte: 'off',
  };
}

function slug(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function produtoDeComum(a) {
  return {
    codigo: `comum:${slug(a.nome)}`,
    nome: a.nome,
    marca: '',
    unidade: a.unidade,
    kcal100: a.kcal100,
    dose: a.dose || null,
    fonte: 'comum',
    grupo: a.grupo,
  };
}

function produtoDeCustom(row) {
  return {
    codigo: `custom:${row.id}`,
    nome: row.nome,
    marca: row.marca || '',
    unidade: row.unidade || 'g',
    kcal100: +row.kcal100,
    dose: row.dose || null,
    fonte: 'custom',
    id: row.id,
  };
}

function erroRede(e) {
  if (e && e.name === 'AbortError') return new Error('O Open Food Facts não respondeu a tempo. Tenta de novo.');
  return new Error('Sem ligação ao Open Food Facts. Podes usar a tabela local ou introduzir as calorias à mão.');
}

async function pedir(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (r.status === 404) return { status: 0 };
    if (r.status === 429) throw new Error('Demasiados pedidos ao Open Food Facts. Tenta daqui a pouco.');
    if (r.status >= 500) throw new Error('O Open Food Facts está indisponível agora. Tenta daqui a pouco.');
    if (!r.ok) throw new Error(`O Open Food Facts respondeu ${r.status}.`);
    return await r.json();
  } catch (e) {
    if (e && (e.name === 'AbortError' || e instanceof TypeError)) throw erroRede(e);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Produto por código de barras. Usa a cache antes da rede. */
export async function buscarProduto(codigo, { forcar = false } = {}) {
  const c = normalizarCodigo(codigo);
  if (!c) throw new Error('Código inválido. Use os 8 a 14 dígitos do código de barras.');

  const guardado = await get('alimentoCache', c).catch(() => null);
  if (!forcar && guardado?.produto && Date.now() - (guardado.atualizado || 0) < TTL) {
    return { ...guardado.produto, cache: true };
  }

  try {
    const j = await pedir(`${API}/api/v2/product/${c}.json?fields=${CAMPOS}`);
    const p = j && j.product ? produtoDeOFF(j.product) : null;
    if (!p) {
      if (j && j.status === 0) throw new Error('Produto não encontrado. Confirma o código ou introduz as calorias à mão.');
      throw new Error('O produto existe mas não tem calorias por 100 g/ml. Introduz o valor à mão.');
    }
    await put('alimentoCache', { codigo: c, produto: p, atualizado: Date.now() });
    return p;
  } catch (e) {
    // uma cópia antiga é melhor do que nada quando o serviço está em baixo
    if (guardado?.produto) return { ...guardado.produto, cache: true, desatualizado: true };
    throw e;
  }
}

async function locais(termo) {
  const q = limpar(termo).toLocaleLowerCase('pt');
  const bate = (p) => !q || `${p.nome} ${p.marca || ''}`.toLocaleLowerCase('pt').includes(q);
  const custom = (await all('alimentoCustom').catch(() => []))
    .map(produtoDeCustom).filter(bate);
  const comuns = ALIMENTOS_COMUNS.map(produtoDeComum).filter(bate);
  const cache = (await all('alimentoCache').catch(() => []))
    .map(r => r.produto).filter(Boolean).filter(bate);
  const vistos = new Set();
  return [...custom, ...comuns, ...cache].filter(p => {
    const k = p.codigo || `${p.nome}|${p.marca}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).slice(0, 20);
}

/** Sugestões para abrir a folha sem escrever nada. */
export async function sugestoes() {
  const custom = (await all('alimentoCustom').catch(() => [])).map(produtoDeCustom);
  return [...custom, ...ALIMENTOS_COMUNS.slice(0, 8).map(produtoDeComum)].slice(0, 12);
}

/** Pesquisa só na tabela local, cache e alimentos personalizados. */
export async function pesquisarLocais(termo) {
  return locais(termo);
}

/**
 * Pesquisa local primeiro e, se houver rede, no Open Food Facts.
 * Devolve { locais, remotos, offline, erro }.
 */
export async function pesquisarAlimentos(termo) {
  const q = limpar(termo);
  const perto = await locais(q);
  if (q.length < 2) return { locais: perto, remotos: [], offline: false };
  try {
    const url = `${API}/api/v2/search?search_terms=${encodeURIComponent(q)}&page_size=20&fields=${CAMPOS}`;
    const j = await pedir(url);
    const remotos = (j?.products || []).map(produtoDeOFF).filter(Boolean);
    return { locais: perto, remotos, offline: false };
  } catch (e) {
    return { locais: perto, remotos: [], offline: true, erro: e.message || String(e) };
  }
}

export async function listarCustom() {
  return (await all('alimentoCustom').catch(() => [])).map(produtoDeCustom);
}

/** Guarda um produto vindo da pesquisa para o poder reutilizar offline. */
export async function guardarNaCache(produto) {
  const c = normalizarCodigo(produto && produto.codigo);
  if (!c) return;
  await put('alimentoCache', { codigo: c, produto: Object.assign({}, produto, { codigo: c }), atualizado: Date.now() });
}

/** Cria um alimento com valores exatos (por 100 g/ml). */
export async function salvarCustom({ nome, marca = '', kcal100, unidade = 'g', dose = null }) {
  const n = limpar(nome);
  if (n.length < 2) throw new Error('Dê um nome ao alimento.');
  const kcal = num(kcal100);
  if (kcal == null || kcal < 0 || kcal > 1000) throw new Error('Indique as calorias por 100 g/ml (0 a 1000).');
  const u = unidade === 'ml' ? 'ml' : 'g';
  const d = dose == null || dose === '' ? null : num(dose);
  if (d != null && (d <= 0 || d > 5000)) throw new Error('A dose habitual deve estar entre 1 e 5000.');
  const row = {
    id: uid(), nome: n, marca: limpar(marca), kcal100: Math.round(kcal * 10) / 10,
    unidade: u, dose: d, criado: new Date().toISOString(),
  };
  await put('alimentoCustom', row);
  return produtoDeCustom(row);
}

export async function apagarCustom(id) {
  await del('alimentoCustom', id);
}

/** Calorias de uma quantidade (g ou ml) de um produto. */
export function kcalDe(produto, quantidade) {
  const q = num(quantidade);
  if (q == null || q <= 0 || q > 5000) return null;
  return Math.round((produto.kcal100 * q) / 100);
}

/** Item pronto a guardar dentro de uma refeição. */
export function itemDe(produto, quantidade) {
  const q = num(quantidade);
  const kcal = kcalDe(produto, q);
  if (kcal == null) throw new Error('Indique uma quantidade entre 1 e 5000 g/ml.');
  return {
    codigo: produto.codigo || '',
    nome: produto.nome,
    marca: produto.marca || '',
    unidade: produto.unidade || 'g',
    quantidade: q,
    kcal100: produto.kcal100,
    kcal,
    fonte: produto.fonte || 'off',
  };
}
