/* ==========================================================================
   screens/farmacia.js — Aba 3 · Ecrã 4 do plano
   Farmácia pessoal (base de dados criada pelo utilizador, toma com um clique
   no horário) · Hidratação (incremento personalizável) · Alimentação
   ========================================================================== */

import {
  diaKey, getDia, patchDia, hhmm, settings, saveSettings,
  farmacia, apagarItem, toggleToma, tomasDoDia, refeicoes, crises, dias, diasComDados,
} from '../store.js';
import { esc, fmt, dataLonga, ICON, on, haptic, toast, sheet, el } from '../utils.js';
import { anel, barrasHorizontais, chartRelacao } from '../charts.js';
import { cabecalho, segmentados, vazio } from './parts.js';
import { sheetAgua, sheetTomas, sheetRefeicao, sheetItemFarmacia } from './acoes.js';
import { route, go, refresh } from '../nav.js';

const SUBS = [
  { id: 'farmacia', nome: 'Farmácia' },
  { id: 'agua',     nome: 'Hidratação' },
  { id: 'comida',   nome: 'Alimentação' },
];
const TITULOS = { farmacia: 'Farmácia pessoal', agua: 'Hidratação', comida: 'Alimentação' };
const SUBTITULOS = {
  farmacia: 'A sua base de dados de medicação. Um toque no horário marca a toma.',
  agua: 'Contador ajustado ao tamanho do seu copo.',
  comida: 'Refeições por texto e fotografia, preparadas para leitura automática de calorias.',
};

const HOJE = () => diaKey();
const rotuloDia = (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
let _memoria = null;

/** Hoje à hora HH:MM — usado para marcar a toma no horário do item. */
function dataHora(hhmmStr) {
  const [h, m] = String(hhmmStr).split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/* ------------------------------------------------------------- farmácia -- */

async function seccaoFarmacia() {
  const itens = await farmacia();
  const tomas = await tomasDoDia(HOJE());
  const ativos = itens.filter(i => i.ativo !== false);
  const tomou = (itemId, hora) => tomas.some(t => t.itemId === itemId && t.hora === hora);

  const esperadas = ativos.reduce((a, i) => a + (i.tomarAs?.length || 0), 0);
  // A adesão só conta as tomas dos horários programados. As tomas SOS e as
  // “+ agora” continuam na lista, mas não podem esconder uma dose em falta.
  const cumpridas = ativos.reduce((a, i) =>
    a + (i.tomarAs || []).filter(h => tomou(i.id, h)).length, 0);
  const feitas = tomas.length;
  const emFalta = Math.max(0, esperadas - cumpridas);

  _memoria = Object.assign(_memoria || {}, { itens, tomas });

  const grupos = ['medicamento', 'suplemento'].map(cat => {
    const doGrupo = ativos.filter(i => (i.categoria || 'medicamento') === cat);
    if (!doGrupo.length) return '';
    return `
      <div class="section">
        <div class="section-title">${cat === 'medicamento' ? 'Medicamento' : 'Suplementos'}
          <span class="badge blue">${doGrupo.length}</span></div>
        <div class="list">
          ${doGrupo.map(i => {
            const hs = i.tomarAs && i.tomarAs.length ? i.tomarAs : null;
            return `<div class="row">
              <span class="row-ico" style="background:rgba(45,212,191,.14);color:var(--cyan)">${ICON.pilula}</span>
              <div class="row-main">
                <div class="row-title">${esc(i.nome)}${i.dosagem ? ` <small class="muted">${esc(i.dosagem)}</small>` : ''}</div>
                <div class="chips mt8">
                  ${hs ? hs.map(h => `<button class="chip" data-toma="${esc(i.id)}" data-h="${esc(h)}"
                      aria-pressed="${tomou(i.id, h)}" title="Marcar ou limpar a toma das ${esc(h)}">${esc(h)}${tomou(i.id, h) ? ' ✓' : ''}</button>`).join('')
                    : '<span class="muted" style="font-size:12px">sem horários — edite para definir</span>'}
                  <button class="chip" data-toma="${esc(i.id)}" data-agora="1"
                    aria-pressed="${tomas.some(t => t.itemId === i.id)}">+ agora</button>
                </div>
              </div>
              <div class="row-end">
                <button class="icon-btn" data-editar="${esc(i.id)}" aria-label="Editar ${esc(i.nome)}">${ICON.lapis}</button>
                <button class="icon-btn" data-apagar="${esc(i.id)}" aria-label="Apagar ${esc(i.nome)}">${ICON.lixo}</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  const sosHoje = (await crises(1))
    .filter(c => c.data === HOJE() && (c.tomaMedicacaoIds || []).length).length;

  return `
    <div class="card">
      <div class="split">
        <div class="center">
          <div class="ring" style="margin:2px auto 6px">
            ${anel({ valor: cumpridas, total: Math.max(1, esperadas), tamanho: 116, espessura: 12 })}
            <div class="ring-txt"><b>${esperadas ? Math.round((cumpridas / esperadas) * 100) + '%' : '—'}</b>
              <small>${cumpridas} de ${esperadas || 0}</small></div>
          </div>
          <div class="metric-label">Aderência de hoje</div>
        </div>
        <div style="min-width:0">
          <div class="kv"><span>Tomadas</span><span>${feitas}</span></div>
          <div class="kv"><span>Programadas</span><span>${esperadas}</span></div>
          <div class="kv"><span>Em falta</span><span style="color:${emFalta ? 'var(--amber)' : 'var(--green)'}">${emFalta}</span></div>
          <div class="kv"><span>SOS em crises</span><span>${sosHoje}</span></div>
        </div>
      </div>
      <div class="btn-row mt12">
        <button class="btn btn-sm btn-block" data-acao="tomas">${ICON.check} Marcar toma</button>
        <button class="btn btn-sm btn-block" data-acao="novo-item">${ICON.mais} Novo item</button>
      </div>
    </div>

    ${grupos || ''}

    ${!ativos.length ? `<div class="section">${vazio(
      'A farmácia está vazia',
      'Crie os seus medicamentos e suplementos; os horários passam a botões de um toque.',
      `<button class="btn btn-primary" data-acao="novo-item">${ICON.mais} Criar o primeiro item</button>`)}</div>` : ''}

    <p class="hint mt16">Tudo fica apenas neste dispositivo. Lápis para editar, caixote do lixo para apagar.</p>`;
}

/* ---------------------------------------------------------------- água ---- */

async function seccaoAgua() {
  const s = await settings();
  const dia = await getDia(HOJE());
  const passo = s.incrementoAguaMl;
  const copos = Math.floor(dia.aguaMl / passo);
  const pct = Math.min(1, dia.aguaMl / s.objetivoAguaMl);

  const chaves = dias(14);
  const registos = await diasComDados(chaves);
  const vals = Object.fromEntries(registos.map(r => [r.data, r.aguaMl]));
  const itens = chaves.slice().reverse().map(k => ({
    rotulo: rotuloDia(k),
    valor: vals[k] || 0,
    cor: (vals[k] || 0) >= s.objetivoAguaMl ? '#34d399' : (vals[k] || 0) > 0 ? '#38bdf8' : '#64748b',
  })).filter(i => i.valor);
  _memoria = Object.assign(_memoria || {}, { agua: { itens } });

  return `
    <div class="card center">
      <div class="ring" style="margin:4px auto 10px">
        ${anel({ valor: dia.aguaMl, total: s.objetivoAguaMl, tamanho: 150, espessura: 13 })}
        <div class="ring-txt"><b>${fmt(dia.aguaMl)} ml</b><small>${Math.round(pct * 100)}% do objetivo</small></div>
      </div>
      <div class="chips" style="justify-content:center">
        ${Array.from({ length: Math.min(16, copos) }, () =>
          `<span style="color:#38bdf8;font-size:18px" title="copo de ${passo} ml">▮</span>`).join('')
          || '<span class="muted" style="font-size:12.5px">ainda sem copos hoje</span>'}
      </div>
      <div class="grid3 mt12">
        <button class="btn" data-add="${passo}">+ ${fmt(passo)} ml</button>
        <button class="btn" data-add="${passo * 2}">+ ${fmt(passo * 2)} ml</button>
        <button class="btn" data-add="${passo * 3}">+ ${fmt(passo * 3)} ml</button>
      </div>
      <div class="btn-row mt12">
        <button class="btn btn-ghost" data-add="-${passo}">− ${passo} ml</button>
        <button class="btn btn-ghost" data-acao="agua">Quantidade à medida</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Personalizar</div>
      <div class="card">
        <div class="grid2">
          <label class="fld" style="margin-bottom:0"><span>Objetivo diário (ml)</span>
            <input type="number" min="500" max="6000" step="100" value="${s.objetivoAguaMl}" data-objetivo></label>
          <label class="fld" style="margin-bottom:0"><span>Tamanho do copo (ml)</span>
            <input type="number" min="50" max="1000" step="10" value="${passo}" data-incremento></label>
        </div>
        <p class="hint mt8">O incremento define os botões de um toque do dashboard e desta aba.</p>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Últimos 14 dias</div>
      <div class="card">
        <div class="chart" data-chart="agua">${itens.length ? '' : '<div class="empty">Sem água registada neste período.</div>'}</div>
        <div class="legend">
          <span><i style="background:#34d399"></i>objetivo atingido</span>
          <span><i style="background:#38bdf8"></i>abaixo do objetivo</span>
        </div>
      </div>
    </div>`;
}

/* ----------------------------------------------------------- alimentação -- */

async function seccaoComida() {
  const hoje = HOJE();
  const rs = await refeicoes(30);
  const deHoje = rs.filter(r => r.data === hoje);
  const kcalHoje = deHoje.reduce((a, r) => a + (r.calorias || 0), 0);
  const comKcal = rs.filter(r => r.calorias);

  const chaves = dias(30);
  const vals = {};
  for (const r of rs) if (r.calorias) vals[r.data] = (vals[r.data] || 0) + r.calorias;
  _memoria = Object.assign(_memoria || {}, { refeicoes: rs, kcal: { chaves, vals } });

  const lista = deHoje.length ? deHoje.map(r => `
    <div class="row">
      <span class="row-ico" style="background:rgba(251,191,36,.14);color:var(--amber)">${ICON.comida}</span>
      <div class="row-main">
        <div class="row-title">${esc(r.texto || 'Refeição com fotografia')}</div>
        <div class="row-sub">${esc(r.hora)}${r.calorias ? ` · ${fmt(r.calorias)} kcal` : ''}</div>
        ${r.fotos && r.fotos.length ? `<div class="grid3 mt8" style="max-width:196px">
          ${r.fotos.map((f, i) => `<img src="${f}" alt="Fotografia da refeição de ${esc(r.hora)}"
            data-ampliar="${esc(r.id)}:${i}"
            style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid var(--stroke);cursor:zoom-in">`).join('')}
        </div>` : ''}
      </div>
    </div>`).join('')
    : vazio('Sem refeições hoje', 'Registe em segundos: texto, calorias opcionais e fotografia.');

  return `
    <div class="stats">
      <div class="stat"><b>${deHoje.length}</b><span>refeições hoje</span></div>
      <div class="stat"><b>${fmt(kcalHoje)}</b><span>kcal somadas</span></div>
      <div class="stat"><b>${comKcal.length}</b><span>com calorias · 30 d</span></div>
    </div>

    <div class="btn-row mt12">
      <button class="btn btn-primary btn-block" data-acao="refeicao">${ICON.mais} Registar refeição</button>
    </div>

    <div class="section">
      <div class="section-title">Hoje · ${esc(dataLonga(hoje))}</div>
      <div class="list">${lista}</div>
    </div>

    <div class="section">
      <div class="section-title">Calorias por dia · 30 dias</div>
      <div class="card"><div class="chart" data-chart="kcal"></div></div>
      <p class="hint mt12">A contagem é opcional e manual. A estrutura de dados já prevê uma API de
        reconhecimento de alimentos por fotografia.</p>
    </div>`;
}

const SECCOES = { farmacia: seccaoFarmacia, agua: seccaoAgua, comida: seccaoComida };

/* -------------------------------------------------------------- render ---- */

export async function render() {
  const sub = SUBS.some(s => s.id === route.sub) ? route.sub : 'farmacia';
  const html = await SECCOES[sub]();
  const host = el(`<div class="fade-in">
    ${cabecalho({ kicker: 'Nutrição e medicação', titulo: TITULOS[sub], sub: SUBTITULOS[sub] })}
    ${segmentados(sub, SUBS)}
    <div class="mt16">${html}</div>
  </div>`);
  host.dataset.sub = sub;
  return host;
}

/* --------------------------------------------------------------- bind ----- */

const ACCOES = {
  tomas: () => sheetTomas(HOJE()),
  agua: () => sheetAgua(HOJE()),
  refeicao: () => sheetRefeicao(),
  'novo-item': () => sheetItemFarmacia(null),
};

export async function bind(root) {
  const sub = root.dataset.sub;

  on(root, 'click', '[data-sub]', (e, b) => {
    if (b.dataset.sub && b.dataset.sub !== sub) { haptic(6); go('farmacia', b.dataset.sub); }
  });
  on(root, 'click', '[data-acao]', (e, b) => {
    const fn = ACCOES[b.dataset.acao];
    if (fn) { haptic(8); fn(); }
  });

  /* toma com um toque no horário */
  on(root, 'click', '[data-toma]', async (e, b) => {
    const quando = b.dataset.agora ? new Date() : dataHora(b.dataset.h);
    const r = await toggleToma(b.dataset.toma, quando);
    haptic(r.tomado ? [10, 30, 10] : 5);
    toast(r.tomado ? `Toma marcada às ${hhmm(quando)}` : 'Toma retirada');
    refresh();
  });

  on(root, 'click', '[data-editar]', (e, b) => {
    const item = (_memoria?.itens || []).find(i => i.id === b.dataset.editar);
    if (item) sheetItemFarmacia(item);
  });

  on(root, 'click', '[data-apagar]', async (e, b) => {
    const item = (_memoria?.itens || []).find(i => i.id === b.dataset.apagar);
    if (!item) return;
    if (!confirm(`Apagar «${item.nome}» da farmácia? As tomas já registadas são conservadas.`)) return;
    await apagarItem(item.id);
    haptic([12, 40, 12]); toast('Item apagado'); refresh();
  });

  /* água — botões de um toque */
  on(root, 'click', '[data-add]', async (e, b) => {
    const delta = +b.dataset.add;
    const dia = await getDia(HOJE());
    await patchDia(HOJE(), { aguaMl: Math.max(0, dia.aguaMl + delta) });
    haptic(delta > 0 ? 10 : 5);
    refresh();
  });

  const objetivo = root.querySelector('[data-objetivo]');
  if (objetivo) objetivo.onchange = async () => {
    const v = Math.min(6000, Math.max(500, +objetivo.value || 2000));
    await saveSettings({ objetivoAguaMl: v });
    toast(`Objetivo: ${fmt(v)} ml`); refresh();
  };
  const incremento = root.querySelector('[data-incremento]');
  if (incremento) incremento.onchange = async () => {
    const v = Math.min(1000, Math.max(50, +incremento.value || 250));
    await saveSettings({ incrementoAguaMl: v });
    toast(`Copo: ${fmt(v)} ml`); refresh();
  };

  /* fotografia ampliada */
  on(root, 'click', '[data-ampliar]', (e, img) => {
    const [id, i] = img.dataset.ampliar.split(':');
    const r = (_memoria?.refeicoes || []).find(x => x.id === id);
    const src = r && r.fotos ? r.fotos[+i] : img.src;
    sheet({
      titulo: 'Fotografia da refeição',
      sub: r ? `${dataLonga(r.data)} · ${esc(r.hora)}` : '',
      corpo: `<div class="center"><img src="${src}" alt="Fotografia da refeição"
        style="width:100%;max-height:60vh;object-fit:contain;border-radius:14px">
        ${r && r.texto ? `<p class="hint mt12">${esc(r.texto)}</p>` : ''}</div>`,
      acoes: `<button class="btn btn-ghost btn-block" data-fechar>Fechar</button>`,
    });
  });

  /* gráficos com a largura real do contentor */
  const ax = root.querySelector('[data-chart="agua"]');
  if (ax && _memoria?.agua?.itens?.length) {
    const largura = Math.max(260, Math.floor(ax.getBoundingClientRect().width) || 320);
    ax.innerHTML = barrasHorizontais(_memoria.agua.itens, { largura, sufixo: ' ml' });
  }
  const kx = root.querySelector('[data-chart="kcal"]');
  if (kx && _memoria?.kcal) {
    const largura = Math.max(280, Math.floor(kx.getBoundingClientRect().width) || 320);
    kx.innerHTML = chartRelacao({
      dias: _memoria.kcal.chaves, largura, altura: 200,
      linha: { vals: _memoria.kcal.vals, nome: 'kcal das refeições', cor: '#fbbf24', dec: true },
    });
  }
}
