/* ==========================================================================
   screens/sintomas.js — Aba 2 · Diário · Enxaquecas · Digestivo · Estado
   (Ecrãs 2, 3 e 5 do plano, reunidos num único módulo com separadores)
   ========================================================================== */

import {
  diaKey, getDia, patchDia, crises, criseAtiva, registosFezes, refeicoes, tomasDoDia, farmacia,
  dias, diasComDados, ZONAS_CABECA, BRISTOL, DOENCAS, duracao, hhmm, removerAfrontamento,
} from '../store.js';
import { esc, fmt, el, dataLonga, dataCurta, ICON, on, haptic, toast, bristolSVG } from '../utils.js';
import { corIntensidade, barrasHorizontais, chartRelacao } from '../charts.js';
import { cabecalho, segmentados, vazio, etiquetaOrigem } from './parts.js';
import {
  sheetCrise, sheetDigestivo, sheetRefeicao, sheetAgua, sheetTomas, sheetAfrontamento, sheetPeso,
  cardCriseAtiva, intensidadeLabel,
} from './acoes.js';
import { route, go, refresh } from '../nav.js';

const SUBS = [
  { id: 'diario',     nome: 'Diário' },
  { id: 'enxaquecas', nome: 'Enxaquecas' },
  { id: 'digestivo',  nome: 'Digestivo' },
  { id: 'estado',     nome: 'Estado' },
];

const TITULOS = {
  diario: 'Diário do dia',
  enxaquecas: 'Enxaquecas',
  digestivo: 'Digestivo e sintomas',
  estado: 'Estado geral e stress',
};
const SUBTITULOS = {
  diario: 'Tudo o que foi registado, hora a hora',
  enxaquecas: 'Cronómetro, zonas da cabeça e histórico de 30 dias',
  digestivo: 'Escala de Bristol, afrontamentos e doenças pontuais',
  estado: 'Energia e stress em dois deslizadores · notas livres',
};

let _data = diaKey();     // dia em edição (Diário, Digestivo, Estado)
let _memoria = null;      // dados do último render, reutilizados pelo bind()

const zonaNome = (id) => (ZONAS_CABECA.find(z => z.id === id) || { nome: id }).nome;
const noDia = (reg, chave) => reg.data === chave;

/* -------------------------------------------------------- selector ----- */

function seletorDia() {
  const chaves = [];
  for (let i = 0; i < 8; i++) { const d = new Date(); d.setDate(d.getDate() - i); chaves.push(diaKey(d)); }
  return `<div class="chips" style="gap:7px">
    ${chaves.map((k, i) => `<button class="chip" data-dia="${k}" aria-pressed="${k === _data}">
      ${i === 0 ? 'Hoje' : esc(dataCurta(new Date(k + 'T12:00')))}</button>`).join('')}
  </div>`;
}

/* ---------------------------------------------------------- 1 · Diário -- */

async function diario() {
  const chave = _data;
  const [dia, cs, fs, rf, tm, itens] = await Promise.all([
    getDia(chave), crises(45), registosFezes(45), refeicoes(45), tomasDoDia(chave), farmacia(),
  ]);
  const nomeItem = (id) => (itens.find(i => i.id === id) || { nome: 'item removido' }).nome;

  const eventos = [];
  for (const c of cs.filter(r => noDia(r, chave))) {
    eventos.push({
      hora: hhmm(new Date(c.dataInicio)), cls: 'mig',
      corpo: `<b>Enxaqueca ${c.intensidade}/10 · ${intensidadeLabel(c.intensidade)}</b>
        <small>${esc((c.zonas || []).map(zonaNome).join(', ') || 'zona por definir')} ·
          ${c.dataFim ? duracao(c.dataInicio, c.dataFim) : 'ainda em curso'}
          ${c.deltaPressao6hHpa != null ? ` · Δ6 h ${c.deltaPressao6hHpa > 0 ? '+' : ''}${fmt(c.deltaPressao6hHpa, 1)} hPa` : ''}</small>`,
    });
  }
  for (const t of tm) {
    eventos.push({
      hora: t.hora, cls: 'med',
      corpo: `<b>${esc(nomeItem(t.itemId))}</b><small>toma registada</small>`,
    });
  }
  for (const f of fs.filter(r => noDia(r, chave))) {
    const b = BRISTOL[f.tipo - 1] || {};
    eventos.push({
      hora: hhmm(new Date(f.hora)), cls: 'stool',
      corpo: `<b>Evacuação · tipo ${f.tipo} ${esc(b.nome || '')}</b>
        ${f.hemorroides ? `<small>desconforto ${f.hemorroides.desconforto}/10${f.hemorroides.sangramento ? ' · sangramento' : ''}
          ${f.hemorroides.fatores && f.hemorroides.fatores.length ? ' · ' + esc(f.hemorroides.fatores.join(', ')) : ''}</small>` : ''}`,
    });
  }
  for (const a of (dia.afrontamentos || [])) {
    eventos.push({
      hora: a.hora, cls: 'hot',
      corpo: `<b>Afrontamento · ${a.intensidade}/10</b>
        <small>calor súbito${a.notas ? ' · ' + esc(a.notas) : ''}</small>`,
    });
  }
  for (const r of rf.filter(x => noDia(x, chave))) {
    eventos.push({
      hora: r.hora, cls: 'food',
      corpo: `<b>${esc((r.texto || 'refeição').slice(0, 60))}</b>
        <small>${r.calorias ? fmt(r.calorias) + ' kcal · ' : ''}${r.fotos && r.fotos.length ? r.fotos.length + ' foto(s)' : 'sem foto'}</small>`,
    });
  }
  eventos.sort((a, b) => a.hora.localeCompare(b.hora));

  const origens = [...new Set(Object.values(dia.origem || {}))];

  const cartao = `
    <div class="card card-tight mt16">
      <div class="metric-label">Números de ${_data === diaKey() ? 'hoje' : esc(dataLonga(chave))}</div>
      <div class="grid2 mt8">
        ${kv('Água', dia.aguaMl ? `${fmt(dia.aguaMl)} ml` : '—')}
        ${kv('Sono', dia.sonoHoras ? `${fmt(dia.sonoHoras, 1)} h` : '—')}
        ${kv('Peso', dia.pesoKg ? `${fmt(dia.pesoKg, 1)} kg` : '—')}
        ${kv('Passos', dia.passos ? fmt(dia.passos) : '—')}
        ${kv('Pressão', dia.pressaoHpa ? `${fmt(dia.pressaoHpa, 1)} hPa` : '—')}
        ${kv('HRV', dia.hrvMs ? `${fmt(dia.hrvMs)} ms` : '—')}
      </div>
      ${origens.length ? `<div class="chips mt12" style="gap:6px">${origens.map(etiquetaOrigem).join('')}</div>` : ''}
      <div class="btn-row mt12">
        <button class="btn btn-sm btn-ghost" data-acao="peso">${ICON.peso} ${dia.pesoKg != null ? 'Editar peso' : 'Registar peso'}</button>
      </div>
    </div>`;

  const cronologia = eventos.length
    ? `<div class="tl mt16">${eventos.map(e => `<div class="tl-item ${e.cls}">
        <div class="tl-time">${e.hora}</div><div class="tl-body">${e.corpo}</div></div>`).join('')}</div>`
    : vazio('Nada registado neste dia', 'Use os botões abaixo — cada registo leva menos de 5 segundos.');

  const doencasHTML = (dia.doencas && dia.doencas.length)
    ? `<div class="section-title mt20">Doenças pontuais</div>
       <div class="chips" style="gap:6px">${dia.doencas.map(d => `<span class="badge red"><i class="dot"></i>${esc(d)}</span>`).join('')}</div>`
    : '';

  return {
    html: `
      <div class="mt16">${seletorDia()}</div>
      <p class="hint" style="margin-top:8px">${esc(dataLonga(chave))}${_data !== diaKey() ? ' · a editar um dia passado' : ''}</p>
      ${cartao}
      ${cronologia}
      ${doencasHTML}
      <div class="section-title mt20">Notas do dia</div>
      <label class="fld"><span>O que se passou, contexto, sensações</span>
        <textarea data-notas placeholder="Ex.: dia de muito trabalho, ecrãs até tarde, acordei com pressão no topo da cabeça…">${esc(dia.notas || '')}</textarea></label>
      <div class="grid2">
        ${_data === diaKey() ? `<button class="btn btn-sm" data-acao="crise">${ICON.cabeca} Enxaqueca</button>` : ''}
        <button class="btn btn-sm" data-acao="digestivo">${ICON.escama} Registo digestivo</button>
        <button class="btn btn-sm" data-acao="refeicao">${ICON.comida} Refeição</button>
        <button class="btn btn-sm" data-acao="agua">${ICON.agua} Água</button>
        <button class="btn btn-sm" data-acao="tomas">${ICON.pilula} Tomar medicação</button>
        <button class="btn btn-sm btn-ghost" data-acao="estado">${ICON.termo} Estado / stress</button>
      </div>
      <p class="hint mt12">${_data === diaKey()
        ? 'Cada registo guarda a hora exata e alimenta os relatórios de correlação.'
        : 'A editar um dia passado. As crises antigas editam-se na aba Enxaquecas; os restantes registos ficam nesta data.'}</p>`,
  };
}

const kv = (label, valor) =>
  `<div><div class="metric-label" style="font-size:10.5px">${esc(label)}</div>
     <div style="font-size:17px;font-weight:700;letter-spacing:-.4px;margin-top:2px">${valor}</div></div>`;

/* ----------------------------------------------------- 2 · Enxaquecas -- */

async function enxaquecas() {
  const [ativa, cs] = await Promise.all([criseAtiva(), crises(30)]);
  _memoria = Object.assign(_memoria || {}, { cs });

  const terminadas = cs.filter(c => c.dataFim);
  // a média é sobre as crises terminadas; a ativa entra na lista mas ainda não
  // tem duração — contá-la no numerador e não no divisor falseava a média
  const mediaInt = terminadas.length
    ? terminadas.reduce((s, c) => s + (c.intensidade || 0), 0) / terminadas.length : null;
  const mediaDur = terminadas.length
    ? terminadas.reduce((s, c) => s + (c.tempoAntesMin || 0), 0) / terminadas.length / 60 : null;
  const comSOS = cs.filter(c => (c.tomaMedicacaoIds || []).length).length;

  const lista = cs.length ? cs.map(c => `
    <div class="row tap" data-crise-id="${c.id}" role="button" tabindex="0">
      <span class="row-ico" style="background:${corIntensidade(c.intensidade)}22;color:${corIntensidade(c.intensidade)}">${ICON.cabeca}</span>
      <div class="row-main">
        <div class="row-title">${esc(dataLonga(c.data))} · ${hhmm(new Date(c.dataInicio))}</div>
        <div class="row-sub">${esc((c.zonas || []).map(zonaNome).join(', ') || 'zona não indicada')} ·
          ${c.dataFim ? esc(duracao(c.dataInicio, c.dataFim)) : '<b style="color:#fca5a5">em curso</b>'}</div>
      </div>
      <div class="row-end">
        ${c.deltaPressao6hHpa != null ? `<span class="badge blue">Δ${c.deltaPressao6hHpa > 0 ? '+' : ''}${fmt(c.deltaPressao6hHpa, 1)}</span>` : ''}
        <span class="badge" style="color:${corIntensidade(c.intensidade)};border-color:${corIntensidade(c.intensidade)}55;background:${corIntensidade(c.intensidade)}1c">${c.intensidade}/10</span>
        ${ICON.seta}
      </div>
    </div>`).join('') : vazio('Ainda não há crises registadas', 'Quando sentir aura ou dor, toque em “Iniciar crise” — o cronómetro começa de imediato.');

  return {
    ativa,
    html: `
      ${ativa ? '' : `<button class="btn btn-primary btn-block mt16" data-acao="crise">${ICON.raio} Iniciar crise</button>`}

      <div class="stats mt16">
        <div class="stat"><b>${cs.length}</b><span>crises em 30 dias</span></div>
        <div class="stat"><b>${mediaInt == null ? '—' : fmt(mediaInt, 1)}</b><span>intensidade média</span></div>
        <div class="stat"><b>${mediaDur == null ? '—' : fmt(mediaDur, 1) + ' h'}</b><span>duração média</span></div>
        <div class="stat"><b>${comSOS}</b><span>com medicação SOS</span></div>
      </div>

      <div class="section-title mt20">Histórico</div>
      <div class="list">${lista}</div>
      <p class="hint mt12">Toque numa crise para editar zona, intensidade, gatilhos e medicação SOS.
        A pressão atmosférica das 6 h anteriores é capturada automaticamente (Open-Meteo) no início de cada crise.</p>`,
    nota: null,
  };
}

/* ------------------------------------------------------ 3 · Digestivo -- */

async function digestivo() {
  const [dia, fs] = await Promise.all([getDia(_data), registosFezes(60)]);
  _memoria = Object.assign(_memoria || {}, { fs });

  const lista = fs.length ? fs.slice(0, 14).map(f => {
    const b = BRISTOL[f.tipo - 1] || {};
    return `<div class="row">
      <span class="row-ico" style="color:var(--violet)">${bristolSVG(f.tipo)}</span>
      <div class="row-main">
        <div class="row-title">Tipo ${f.tipo} — ${esc(b.nome)}</div>
        <div class="row-sub">${esc(dataLonga(f.data))} · ${hhmm(new Date(f.hora))}</div>
      </div>
      <div class="row-end">
        ${f.hemorroides && f.hemorroides.sangramento ? '<span class="badge red">sangramento</span>' : ''}
        ${f.hemorroides && f.hemorroides.desconforto ? `<span class="badge amber">desconforto ${f.hemorroides.desconforto}/10</span>` : ''}
      </div>
    </div>`;
  }).join('') : vazio('Sem registos digestivos', 'A escala de Bristol (1–7) e os afrontamentos ficam aqui guardados.');

  return {
    html: `
      <div class="mt16">${seletorDia()}</div>
      <button class="btn btn-primary btn-block mt12" data-acao="digestivo">${ICON.escama} Registar evacuação</button>

      <div class="section-title mt20">Distribuição de Bristol (60 dias)</div>
      <div class="card"><div class="chart" data-chart="bristol" data-altura="200"></div></div>

      <div class="section-title mt20">Últimos registos</div>
      <div class="list">${lista}</div>

      <div class="section-title mt20">Afrontamentos</div>
      <div class="card card-tight">
        ${(dia.afrontamentos || []).length ? `<div class="list">
          ${(dia.afrontamentos || []).map(a => `<div class="row">
            <span class="row-ico" style="background:rgba(251,146,60,.14);color:#fb923c">${ICON.termo}</span>
            <div class="row-main"><div class="row-title">${esc(a.hora)} · intensidade ${a.intensidade}/10</div>
              ${a.notas ? `<div class="row-sub">${esc(a.notas)}</div>` : ''}</div>
            <div class="row-end"><button class="icon-btn" data-del-afront="${esc(a.id)}" aria-label="Apagar afrontamento">${ICON.lixo}</button></div>
          </div>`).join('')}
        </div>` : `<p class="hint" style="margin:0">${_data === diaKey() ? 'Hoje' : 'Neste dia'} ainda não há afrontamentos registados.</p>`}
        <div class="btn-row mt12"><button class="btn btn-sm btn-block" data-acao="afrontamento">${ICON.termo} Registar afrontamento</button></div>
      </div>

      <div class="section-title mt20">Doenças pontuais</div>
      <p class="hint">Marque o que sente ${_data === diaKey() ? 'hoje' : 'no dia escolhido'} — serve para correlacionar com crises e medicação.</p>
      <div class="chips" data-doencas>
        ${DOENCAS.map(d => `<button class="chip red" data-doenca="${esc(d)}" aria-pressed="${(dia.doencas || []).includes(d)}">${esc(d)}</button>`).join('')}
      </div>`,
  };
}

/* --------------------------------------------------------- 4 · Estado -- */

async function estado() {
  const chave = _data;
  const dia = await getDia(chave);
  const ultimos = await diasComDados(dias(14));
  _memoria = Object.assign(_memoria || {}, { ultimos });

  const slider = (nome, campo, icone, cor, esq, dir) => `
    <div class="card">
      <div class="slider-top">
        <span class="slider-name">${ICON[icone]} <span data-lbl="${campo}">${
          dia[campo] == null ? 'sem registo' : `${dia[campo]} · ${etiqueta(campo, dia[campo])}`}</span></span>
        <span class="slider-read" data-read="${campo}" style="color:${cor}">${dia[campo] == null ? '—' : dia[campo]}</span>
      </div>
      <input type="range" min="1" max="10" step="1" value="${dia[campo] == null ? 5 : dia[campo]}"
        data-slider="${campo}" style="--fill:${cor}">
      <div class="slider-scale"><span>${esq}</span><span>${dir}</span></div>
    </div>`;

  return {
    html: `
      <div class="mt16">${seletorDia()}</div>
      <p class="hint" style="margin-top:8px">${esc(dataLonga(chave))}</p>

      <div class="section-title mt16">Energia e stress</div>
      ${slider('Energia', 'energia', 'raio', '#2dd4bf', 'sem energia', 'no máximo')}
      <div class="mt12"></div>
      ${slider('Stress', 'stress', 'cerebro', '#fbbf24', 'muito calmo', 'tensão máxima')}
      <p class="hint mt12">Háptico a cada valor (Android); no iOS Safari a vibração não é exposta às web apps.
        O valor fica guardado assim que largar o deslizador.</p>

      <div class="section-title mt20">Últimos 14 dias</div>
      <div class="card"><div class="chart" data-chart="estado" data-altura="220"></div>
        <div class="legend"><span><i style="background:#2dd4bf"></i>Energia</span>
          <span><i style="background:#f87171"></i>Stress</span></div></div>

      <div class="section-title mt20">Notas livres</div>
      <label class="fld"><span>Diário aberto</span>
        <textarea data-notas placeholder="Reuniões, exercício, álcool, sono Partido… o contexto que os números não mostram.">${esc(dia.notas || '')}</textarea></label>
      <div class="btn-row">
        ${_data === diaKey() ? `<button class="btn btn-sm" data-acao="crise">${ICON.cabeca} Registar crise</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-acao="importar">${ICON.upload} Importar Saúde / Garmin</button></div>
      ${_data === diaKey() ? '' : '<p class="hint mt8">As crises são cronometradas na aba Enxaquecas; aqui fica o estado do dia escolhido.</p>'}`,
  };
}

/** Texto curto ao lado do valor do deslizador. */
function etiqueta(campo, v) {
  if (campo === 'energia') return v <= 2 ? 'esgotado' : v <= 4 ? 'baixa' : v <= 7 ? 'razoável' : 'elevada';
  return v <= 2 ? 'muito calmo' : v <= 4 ? 'tranquilo' : v <= 7 ? 'sob tensão' : 'muito stressado';
}

const SECÇÕES = { diario, enxaquecas, digestivo, estado };

/* ------------------------------------------------------------- render --- */

export async function render(view) {
  const sub = SUBS.some(s => s.id === route.sub) ? route.sub : 'diario';
  const { html, ativa } = await SECÇÕES[sub]();
  const host = el(`
    <div class="fade-in">
      ${cabecalho({ kicker: 'Sintomas e diário', titulo: TITULOS[sub], sub: SUBTITULOS[sub] })}
      ${segmentados(sub, SUBS)}
      <div data-corpo>${html}</div>
    </div>`);
  host.dataset.sub = sub;

  if (sub === 'enxaquecas' && ativa) {
    host.querySelector('[data-corpo]').prepend(cardCriseAtiva(ativa, { aoTerminar: () => refresh() }));
  }
  return host;
}

/* --------------------------------------------------------------- bind --- */

const ACCOES = {
  agua: (d) => sheetAgua(d), peso: (d) => sheetPeso(d), tomas: (d) => sheetTomas(d), crise: () => sheetCrise(),
  digestivo: (d) => sheetDigestivo(d), refeicao: (d) => sheetRefeicao({ data: d }),
  afrontamento: (d) => sheetAfrontamento(d),
  importar: async () => { const { sheetImportar } = await import('../health-import.js'); sheetImportar(); },
};

export async function bind(root) {
  const sub = root.dataset.sub;
  // O dia é fixado no render: um blur/change que chegue depois de trocar de dia
  // não pode gravar no dia novo (era o bug das notas e dos deslizadores).
  const dia = _data;

  on(root, 'click', '.segmented [data-sub]', (e, b) => { haptic(6); go('sintomas', b.dataset.sub); });
  on(root, 'click', '[data-acao]', (e, b) => { const fn = ACCOES[b.dataset.acao]; if (fn) { haptic(8); fn(dia); } });

  on(root, 'click', '[data-dia]', (e, b) => {
    _data = b.dataset.dia;
    haptic(6);
    refresh();
  });

  /* editar uma crise */
  on(root, 'click', '[data-crise-id]', (e, b) => {
    const c = (_memoria && _memoria.cs || []).find(x => x.id === b.dataset.criseId);
    if (c) { haptic(8); sheetCrise(c); }
  });
  on(root, 'keydown', '[data-crise-id]', (e, b) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); }
  });

  /* doenças pontuais */
  on(root, 'click', '[data-doenca]', async (e, b) => {
    const d = b.dataset.doenca;
    const diaAtual = await getDia(dia);
    const atuais = new Set(diaAtual.doencas || []);
    atuais.has(d) ? atuais.delete(d) : atuais.add(d);
    b.setAttribute('aria-pressed', String(atuais.has(d)));
    await patchDia(dia, { doencas: [...atuais] });
    haptic(atuais.has(d) ? 12 : 5);
  });

  /* apagar um afrontamento do dia escolhido */
  on(root, 'click', '[data-del-afront]', async (e, b) => {
    if (!confirm('Apagar este afrontamento?')) return;
    await removerAfrontamento(dia, b.dataset.delAfront);
    haptic(8); toast('Afrontamento apagado'); refresh();
  });

  /* deslizadores de estado */
  root.querySelectorAll('[data-slider]').forEach(r => {
    const campo = r.dataset.slider;
    const read = root.querySelector(`[data-read="${campo}"]`);
    const lbl = root.querySelector(`[data-lbl="${campo}"]`);
    const pintar = () => {
      read.textContent = r.value;
      lbl.textContent = `${r.value} · ${etiqueta(campo, +r.value)}`;
      r.style.setProperty('--pct', ((r.value - 1) / 9 * 100) + '%');
    };
    pintar();
    r.addEventListener('input', () => { pintar(); haptic(3); });
    r.addEventListener('change', async () => {
      await patchDia(dia, { [campo]: +r.value });
      haptic([10, 40, 10]);
      toast(`${campo === 'energia' ? 'Energia' : 'Stress'} ${r.value}/10 guardado`);
    });
  });

  /* notas */
  const notas = root.querySelector('[data-notas]');
  if (notas) {
    notas.addEventListener('blur', async () => {
      const diaAtual = await getDia(dia);
      if ((diaAtual.notas || '') === notas.value) return;
      await patchDia(dia, { notas: notas.value });
      toast('Notas guardadas');
    });
  }

  /* gráficos com largura medida */
  const bx = root.querySelector('[data-chart="bristol"]');
  if (bx) {
    const largura = Math.max(260, Math.floor(bx.getBoundingClientRect().width) || 320);
    const dist = distBristol(_memoria && _memoria.fs);
    bx.innerHTML = dist.length
      ? barrasHorizontais(dist, { largura })
      : `<div class="empty">Sem registos para desenhar.</div>`;
  }
  const es = root.querySelector('[data-chart="estado"]');
  if (es && _memoria && _memoria.ultimos) {
    const largura = Math.max(280, Math.floor(es.getBoundingClientRect().width) || 320);
    const chaves = _memoria.ultimos.map(d => d.data);
    const energia = Object.fromEntries(_memoria.ultimos.map(d => [d.data, d.energia]));
    const stress = Object.fromEntries(_memoria.ultimos.map(d => [d.data, d.stress]));
    es.innerHTML = chartRelacao({
      dias: chaves, largura, altura: +(es.dataset.altura || 220),
      linha: { vals: energia, nome: 'Energia', cor: '#2dd4bf', dec: true },
      barras: { vals: stress, nome: 'Stress', cor: '#f87171' },
    });
  }
}

/** Distribuição da escala de Bristol a partir dos registos (reutiliza _memoria). */
function distBristol(fs) {
  return BRISTOL.map(b => ({
    rotulo: `${b.tipo} · ${b.curto}`,
    valor: (fs || []).filter(f => f.tipo === b.tipo).length,
    cor: b.cor,
  })).filter(d => d.valor);
}
