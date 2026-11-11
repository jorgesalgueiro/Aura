/* ==========================================================================
   importar-refeicoes.js — diário alimentar em CSV (MyFitnessPal e genéricos)
   --------------------------------------------------------------------------
   O MyFitnessPal não tem API pública para o diário. A via possível é exportar
   o diário em CSV (Premium ou arquivo de dados) e importar o ficheiro aqui.
   O analisador é tolerante a nomes de colunas em inglês/português e a
   separadores , ; ou tabulação. Se o ficheiro só tiver totais por refeição,
   importa as calorias sem detalhe de alimentos.
   As quantidades do MyFitnessPal podem ser porções, não gramas: as calorias
   ficam certas, mas a análise por grupos alimentares é aproximada.
   ========================================================================== */

import { adicionarRefeicao, dayKey } from './store.js';
import { el, esc, sheet, toast, haptic, fmt, ICON } from './utils.js';
import { refresh } from './nav.js';
import { grupoPorNome, rotuloGrupo } from './nutricao.js';

const normalizar = (s) => String(s || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function dividirLinha(linha, sep) {
  const out = []; let atual = ''; let entre = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (entre && linha[i + 1] === '"') { atual += '"'; i++; } else entre = !entre;
      continue;
    }
    if (c === sep && !entre) { out.push(atual.trim()); atual = ''; continue; }
    atual += c;
  }
  out.push(atual.trim());
  return out;
}

function detectarSeparador(cab) {
  const cand = [',', ';', '\t', '|'].map(c => [c, cab.split(c).length - 1]);
  cand.sort((a, b) => b[1] - a[1]);
  return cand[0][1] > 0 ? cand[0][0] : ',';
}

const num = (v) => {
  if (v == null || v === '') return null;
  const limpo = String(v).replace(/[^\d,.-]/g, '').replace(',', '.');
  if (!limpo || limpo === '-' || limpo === '.') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
};

function parseData(bruto) {
  const s = String(bruto || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    return a > 12 ? new Date(y, b - 1, a, 12, 0, 0) : new Date(y, a - 1, b, 12, 0, 0);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

const HORAS = {
  breakfast: '08:00', 'pequeno-almoco': '08:00', 'pequeno almoco': '08:00', manha: '08:00',
  lunch: '13:00', almoco: '13:00',
  dinner: '20:00', jantar: '20:00',
  snack: '16:00', snacks: '16:00', lanche: '16:00', lanches: '16:00',
};
function horaDaRefeicao(refeicao, horaTexto) {
  const h = String(horaTexto || '').match(/(\d{1,2}):(\d{2})/);
  if (h) return `${String(+h[1]).padStart(2, '0')}:${h[2]}`;
  const n = normalizar(refeicao);
  for (const [k, v] of Object.entries(HORAS)) if (n.includes(k)) return v;
  return '12:00';
}

const ALIASES = {
  data: ['date', 'data', 'dia', 'diary date', 'date of entry', 'day'],
  refeicao: ['meal', 'meal name', 'meal type', 'refeicao', 'tipo de refeicao'],
  alimento: ['food', 'food name', 'alimento', 'item', 'descricao', 'description', 'food description'],
  qtd: ['quantity', 'qty', 'servings', 'amount', 'quantidade', 'porcao', 'portion'],
  unidade: ['unit', 'unidade', 'serving unit', 'units'],
  hora: ['time', 'hora', 'timestamp'],
};

function acharColuna(headers, aliases) {
  return headers.findIndex(h => aliases.some(a => h === a || h.includes(a)));
}

/** Analisa o texto CSV. Lança um erro legível se não reconhecer o formato. */
export function analisarDiarioAlimentar(texto) {
  const linhas = String(texto || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2) throw new Error('O ficheiro está vazio ou só tem cabeçalho.');
  const sep = detectarSeparador(linhas[0]);
  const headers = dividirLinha(linhas[0], sep).map(normalizar);
  const idx = {};
  for (const [campo, aliases] of Object.entries(ALIASES)) idx[campo] = acharColuna(headers, aliases);
  idx.kcal = acharColuna(headers, ['calories', 'calorias', 'kcal', 'energy (kcal)', 'calories (kcal)']);
  idx.kj = acharColuna(headers, ['energy (kj)', 'energia (kj)', 'kj']);
  if (idx.kcal < 0 && idx.kj < 0) {
    idx.kcal = headers.findIndex(h => h === 'energy' || h === 'energia');
  }
  if (idx.data < 0) throw new Error('Não encontrámos uma coluna de data (Date / Data / Dia).');
  if (idx.kcal < 0 && idx.kj < 0) throw new Error('Não encontrámos uma coluna de calorias (Calories / Calorias / kcal).');
  if (idx.alimento < 0 && idx.refeicao < 0) throw new Error('Não encontrámos uma coluna de alimento (Food) ou de refeição (Meal).');

  const porRefeicao = new Map();
  let itens = 0, semData = 0, semAlimento = 0;
  for (const linha of linhas.slice(1)) {
    const partes = dividirLinha(linha, sep);
    const valor = (campo) => (idx[campo] >= 0 ? partes[idx[campo]] : '');
    const data = parseData(valor('data'));
    if (!data) { semData++; continue; }
    const refeicao = String(valor('refeicao') || 'Refeição').trim() || 'Refeição';
    let nome = String(valor('alimento') || '').trim();
    if (!nome) { nome = refeicao; semAlimento++; }
    const kcal = num(valor('kcal')) ?? (num(valor('kj')) != null ? num(valor('kj')) / 4.184 : 0);
    if (kcal == null && idx.kj < 0) continue;

    const unidadeTxt = normalizar(valor('unidade'));
    const qtd = num(valor('qtd'));
    const ehPeso = /^(g|gramas?|ml|mililitros?)$/.test(unidadeTxt);
    const quantidade = ehPeso && qtd > 0 ? qtd : 100;
    const unidade = ehPeso && /ml|mililitros?/.test(unidadeTxt) ? 'ml' : 'g';
    const kcalFinal = Math.max(0, Number(kcal) || 0);

    const chave = `${dayKey(data)}|${refeicao}`;
    let grupo = porRefeicao.get(chave);
    if (!grupo) {
      grupo = { data: dayKey(data), refeicao, hora: horaDaRefeicao(refeicao, valor('hora')), itens: [], kcal: 0 };
      porRefeicao.set(chave, grupo);
    }
    const g = grupoPorNome(nome);
    grupo.itens.push({
      nome,
      marca: '',
      unidade,
      quantidade,
      kcal: Math.round(kcalFinal),
      kcal100: quantidade > 0 ? Math.round((kcalFinal / quantidade) * 1000) / 10 : 0,
      grupoAnalise: g,
      grupoNome: rotuloGrupo(g),
      fonte: 'myfitnesspal',
    });
    grupo.kcal += Math.round(kcalFinal);
    itens++;
  }

  const refeicoes = [...porRefeicao.values()].sort((a, b) =>
    a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora));
  const dias = new Set(refeicoes.map(r => r.data)).size;
  const totalKcal = Math.round(refeicoes.reduce((a, r) => a + r.kcal, 0));
  const avisos = [];
  if (semData) avisos.push(`${semData} linha(s) sem data reconhecível foram ignoradas.`);
  if (semAlimento) avisos.push(`${semAlimento} linha(s) sem alimento usaram a refeição como nome.`);
  if (!refeicoes.length) avisos.push('Não foi possível criar nenhuma refeição a partir do ficheiro.');
  return { refeicoes, dias, itens, totalKcal, avisos };
}

/** Grava as refeições analisadas; só os últimos 400 dias, como no resto da app. */
export async function guardarDiario(refeicoes) {
  const corte = Date.now() - 400 * 864e5;
  let n = 0, saltadas = 0;
  for (const r of refeicoes || []) {
    const quando = new Date(`${r.data}T00:00`);
    const [h, m] = (r.hora || '12:00').split(':').map(Number);
    quando.setHours(h || 12, m || 0, 0, 0);
    if (quando.getTime() < corte) { saltadas++; continue; }
    await adicionarRefeicao({
      texto: `${r.refeicao}: ${r.itens.slice(0, 4).map(i => i.nome).join(', ')}`,
      calorias: r.kcal,
      itens: r.itens,
      quando,
    });
    n++;
  }
  return { n, saltadas };
}

/* ------------------------------------------------------------------ UI ---- */

export function sheetImportarRefeicoes() {
  let analise = null;
  const corpo = el(`
    <div>
      <div class="note">
        <b>MyFitnessPal</b> não tem API pública para o diário. Exporta o diário em <b>CSV</b>
        (Premium ou pedido de dados) e escolhe o ficheiro aqui. Também aceita um CSV genérico
        com colunas <b>Date, Meal, Food, Calories</b>.
      </div>
      <input type="file" accept=".csv,.tsv,.txt" data-ficheiro hidden>
      <button class="btn btn-primary btn-block mt12" data-escolher>${ICON.upload} Escolher CSV</button>
      <div data-estado class="mt12"></div>
      <div data-previa hidden></div>
      <p class="hint mt12">As quantidades do MyFitnessPal podem ser porções, não gramas:
        as calorias totais ficam certas, mas a análise por grupos é aproximada.
        As refeições são adicionadas como novas; revê e apaga duplicados se reimportares.</p>
    </div>`);

  const input = corpo.querySelector('[data-ficheiro]');
  const estado = corpo.querySelector('[data-estado]');
  const previa = corpo.querySelector('[data-previa]');

  const { fechar } = sheet({
    titulo: 'Importar diário alimentar',
    sub: 'MyFitnessPal ou CSV compatível',
    corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Fechar</button>`,
  });

  const mostrarEstado = (texto, erro = false) => {
    estado.innerHTML = texto ? `<p class="hint" style="color:${erro ? 'var(--red)' : 'var(--text-2)'}">${esc(texto)}</p>` : '';
  };

  const desenharPrevia = () => {
    if (!analise || !analise.refeicoes.length) { previa.hidden = true; return; }
    previa.hidden = false;
    const amostra = analise.refeicoes.slice(0, 6).map(r => `<div class="row">
      <div class="row-main"><div class="row-title">${esc(r.refeicao)} · ${r.itens.length} alimento${r.itens.length > 1 ? 's' : ''}</div>
        <div class="row-sub">${esc(r.data)} ${esc(r.hora)} · ${r.itens.slice(0, 3).map(i => esc(i.nome)).join(', ')}</div></div>
      <div class="row-end"><b>${fmt(r.kcal)} kcal</b></div>
    </div>`).join('');
    previa.innerHTML = `
      <div class="section-title mt20">O que encontrámos</div>
      <div class="card card-tight">
        <div class="stats">
          <div class="stat"><b>${analise.refeicoes.length}</b><span>refeições</span></div>
          <div class="stat"><b>${analise.dias}</b><span>dias</span></div>
          <div class="stat"><b>${fmt(analise.totalKcal)}</b><span>kcal</span></div>
        </div>
        <div class="list">${amostra}</div>
        ${analise.avisos.length ? `<p class="hint mt8">${analise.avisos.map(esc).join(' ')}</p>` : ''}
      </div>
      <button class="btn btn-primary btn-block mt12" data-importar>
        Importar ${analise.refeicoes.length} refeição${analise.refeicoes.length > 1 ? 'ões' : ''}
      </button>`;
    previa.querySelector('[data-importar]').onclick = async () => {
      const btn = previa.querySelector('[data-importar]');
      btn.disabled = true; btn.textContent = 'a importar…';
      try {
        const r = await guardarDiario(analise.refeicoes);
        haptic([10, 40, 10]);
        toast(`${r.n} refeições importadas${r.saltadas ? ` · ${r.saltadas} fora dos 400 dias` : ''}`, 'ok', 5000);
        fechar(); refresh();
      } catch (e) {
        toast(e.message || 'Falha ao importar', 'err', 6000);
        btn.disabled = false; btn.textContent = 'Tentar importar de novo';
      }
    };
  };

  corpo.querySelector('[data-escolher]').onclick = () => input.click();
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    mostrarEstado('a ler o ficheiro…');
    try {
      analise = analisarDiarioAlimentar(await f.text());
      mostrarEstado(analise.refeicoes.length ? '' : 'Não foi possível ler refeições deste ficheiro.', !analise.refeicoes.length);
      desenharPrevia();
    } catch (e) {
      analise = null;
      previa.hidden = true;
      mostrarEstado(e.message || 'Ficheiro não reconhecido.', true);
    }
    input.value = '';
  };

  return fechar;
}
