/* ==========================================================================
   nutricao.js — grupos alimentares e resumo semanal
   --------------------------------------------------------------------------
   A análise usa os alimentos registados nas refeições (não substitui um
   plano alimentar). Cada alimento tem um grupo; os pratos distribuem o peso
   pelas frações dos ingredientes. As referências são genéricas para adultos
   e servem apenas para chamar a atenção para faltas ou excessos evidentes.
   ========================================================================== */

import { refeicoes, get, put, isoOf } from './store.js';

/** Referências diárias aproximadas, em gramas (ou ml). */
export const GRUPOS_ALIMENTARES = [
  { id: 'horticolas', nome: 'Hortícolas',            min: 300, max: 500, cor: '#34d399' },
  { id: 'fruta',      nome: 'Fruta',                 min: 200, max: 300, cor: '#fbbf24' },
  { id: 'cereais',    nome: 'Cereais e tubérculos',  min: 150, max: 300, cor: '#f59e0b' },
  { id: 'proteinas',  nome: 'Proteínas',             min: 100, max: 200, cor: '#f87171' },
  { id: 'laticinios', nome: 'Laticínios',            min: 200, max: 400, cor: '#38bdf8' },
  { id: 'gorduras',   nome: 'Gorduras',              min: 15,  max: 40,  cor: '#a78bfa' },
  { id: 'doces',      nome: 'Doces e processados',   min: 0,   max: 100, cor: '#fb923c' },
  { id: 'outros',     nome: 'Outros / não classificado', min: null, max: null, cor: '#94a3b8' },
];

export const ESTADOS = {
  abaixo:      { nome: 'Abaixo',     classe: 'amber' },
  acima:       { nome: 'Acima',      classe: 'red' },
  ok:          { nome: 'OK',         classe: 'green' },
  'sem-dados': { nome: 'Sem dados',  classe: 'blue' },
  informativo: { nome: '—',          classe: 'blue' },
};

const normalizar = (s) => String(s || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Heurística por nome, usada em produtos sem grupo explícito. */
export function grupoPorNome(nome) {
  const n = normalizar(nome);
  if (/refrigerante|sumo|cerveja|vinho|energetico|achocolatado|colacao|soda|juice|beer|wine|energy drink/.test(n)) return 'doces';
  if (/peanut butter|manteiga de amendoim/.test(n)) return 'gorduras';
  if (/batata frita|fritas|pizza|hamburguer|bolo|bolacha|biscoito|chocolate|gelado|acucar|mel|croissant|pastel|fries|fried|burger|cake|cookie|biscuit|ice cream|sugar|honey|pastry|candy|dessert|syrup/.test(n)) return 'doces';
  if (/leite|iogurte|queijo|requeijao|manteiga|nata|kefir|milk|yogurt|yoghurt|cheese|butter|cream/.test(n)) return 'laticinios';
  if (/ovo|frango|peru|carne|vaca|porco|peixe|salmao|atum|bacalhau|sardinha|tofu|seitan|feijao|grao|lentilha|soja|egg|chicken|turkey|beef|pork|fish|salmon|tuna|cod|sardine|bean|lentil|soy|shrimp|prawn/.test(n)) return 'proteinas';
  if (/banana|maca|pera|laranja|uva|morango|abacate|kiwi|manga|melao|melancia|pessego|ameixa|figo|ananas|fruta|apple|pear|orange|grape|strawberr|avocado|mango|melon|watermelon|peach|plum|pineapple|fruit|blueberr|raspberr/.test(n)) return 'fruta';
  if (/tomate|alface|brocolo|cenoura|legume|salada|espinafre|cebola|pepino|abobora|curgete|pimento|couve|nabo|alho|horticola|tomato|lettuce|broccoli|carrot|vegetable|salad|spinach|onion|cucumber|pumpkin|zucchini|pepper|cabbage|turnip|garlic|mushroom|pea|corn/.test(n)) return 'horticolas';
  if (/pao|tosta|cereal|aveia|arroz|massa|quinoa|broa|cuscuz|polenta|batata|bread|toast|cereal|oat|oatmeal|rice|pasta|potato|couscous|noodle/.test(n)) return 'cereais';
  if (/azeite|oleo|amendoa|noz|castanha|semente|olive oil|oil|almond|nut|walnut|chestnut|seed|peanut/.test(n)) return 'gorduras';
  return 'outros';
}

const MAPA_COMUM = {
  'Pão e cereais': 'cereais',
  'Proteínas': 'proteinas',
  'Laticínios': 'laticinios',
  'Fruta': 'fruta',
  'Legumes': 'horticolas',
  'Leguminosas': 'proteinas',
  'Gorduras': 'gorduras',
  'Doces e refeições': 'doces',
  'Bebidas': 'outros',
};

/** Converte o grupo da tabela local no grupo da análise. */
export function grupoDeComum(grupo, nome = '') {
  const n = normalizar(nome);
  if (/batata frita|fritas|croissant|pastel|pizza|hamburguer/.test(n)) return 'doces';
  if (/queijo|requeijao/.test(n)) return 'laticinios';
  if (grupo === 'Bebidas') return grupoPorNome(nome);
  return MAPA_COMUM[grupo] || grupoPorNome(nome);
}

export const rotuloGrupo = (id) =>
  (GRUPOS_ALIMENTARES.find(g => g.id === id) || {}).nome || 'Outros';

/**
 * Analisa as refeições dos últimos `dias` dias. A média é feita sobre os dias
 * com refeições (não sobre 7), para não penalizar quem não registou tudo.
 */
export async function analisarAlimentacao(dias = 7) {
  const rs = await refeicoes(dias).catch(() => []);
  const totais = Object.fromEntries(GRUPOS_ALIMENTARES.map(g => [g.id, 0]));
  const diasSet = new Set();
  let itens = 0, pratos = 0, gramas = 0, gramasClassificadas = 0;

  const somar = (grupo, q) => {
    if (!(q > 0)) return;
    gramas += q;
    if (grupo && grupo !== 'outros' && totais[grupo] != null) {
      totais[grupo] += q;
      gramasClassificadas += q;
    }
  };

  for (const r of rs) {
    diasSet.add(r.data);
    for (const it of r.itens || []) {
      itens++;
      const q = Number(it.quantidade) || 0;
      if (!(q > 0)) continue;
      if (Array.isArray(it.composicao) && it.composicao.length) {
        pratos++;
        const peso = Number(it.pesoTotal) ||
          it.composicao.reduce((a, x) => a + (Number(x.quantidade) || 0), 0);
        for (const ing of it.composicao) {
          const frac = Number(ing.fracao) ||
            (peso > 0 ? (Number(ing.quantidade) || 0) / peso : 0);
          somar(ing.grupoAnalise || grupoPorNome(ing.nome), q * frac);
        }
      } else {
        somar(it.grupoAnalise || grupoPorNome(it.nome), q);
      }
    }
  }

  const diasCom = diasSet.size;
  const cobertura = gramas > 0 ? Math.round((gramasClassificadas / gramas) * 100) : 0;
  const suficiente = diasCom >= 3 && cobertura >= 50;

  const grupos = GRUPOS_ALIMENTARES.map(g => {
    const total = Math.round(totais[g.id] || 0);
    const media = diasCom > 0 ? Math.round((totais[g.id] || 0) / diasCom) : 0;
    let estado = 'sem-dados';
    if (suficiente && g.min != null) {
      if (media < g.min) estado = 'abaixo';
      else if (g.max != null && media > g.max) estado = 'acima';
      else estado = 'ok';
    } else if (g.min == null && total > 0) {
      estado = 'informativo';
    }
    return { ...g, total, media, estado };
  });

  const alertas = grupos.filter(g => g.estado === 'abaixo' || g.estado === 'acima');
  return {
    dias, diasCom, refeicoes: rs.length, itens, pratos, gramas, cobertura,
    suficiente, grupos, alertas,
  };
}

/**
 * Aviso no máximo uma vez por semana, quando há dados suficientes e alertas.
 * Devolve o resumo ou null.
 */
export async function avisarSemanalmente() {
  const r = await analisarAlimentacao(7);
  if (!r.suficiente || !r.alertas.length) return null;
  const ultimo = await get('meta', 'ultimoAvisoAlimentar').catch(() => null);
  if (ultimo && Date.now() - new Date(ultimo.v).getTime() < 7 * 864e5) return null;
  await put('meta', { k: 'ultimoAvisoAlimentar', v: isoOf() });
  return r;
}
