/* ==========================================================================
   screens/relatorios.js — Aba 4 · Ecrã 6 do plano
   Correlação pressão atmosférica real × crises, comparação livre de variáveis,
   gatilhos e zonas, e exportação em PDF para levar ao médico.
   ========================================================================== */

import {
  crises, dias, diasComDados, settings, refeicoes, ZONAS_CABECA, GATILHOS,
} from '../store.js';
import { esc, fmt, el, dataLonga, dataCurta, ICON, on, haptic, toast, sheet } from '../utils.js';
import {
  chartPressaoVsCrises, chartRelacao, barrasHorizontais, dispersao,
} from '../charts.js';
import { clima, pressaoMediaDiaria, atualizarClima, observarClima } from '../clima.js';
import { bandaPressao } from '../weather.js';
import { cabecalho, vazio } from './parts.js';
import { route, go, refresh } from '../nav.js';

const PERIODOS = [
  { d: 7,  nome: '7 dias' },
  { d: 30, nome: '30 dias' },
  { d: 90, nome: '90 dias' },
];

/* Bandas do Ecrã 6 do plano, apresentadas por ordem de pressão. */
const BANDAS = [
  { chave: '≥1016 hPa',     titulo: 'Pressão alta',    nota: 'ar frio e estável' },
  { chave: '1008–1015 hPa', titulo: 'Pressão normal',  nota: 'referência do dia-a-dia' },
  { chave: '1000–1007 hPa', titulo: 'Queda ligeira',   nota: 'fronteira de instabilidade' },
  { chave: '<1000 hPa',     titulo: 'Queda acentuada', nota: 'frente ativa / tempestade' },
];

/* Variáveis comparáveis (equivalente à seleção livre do Swift Charts). */
const VARIAVEIS = {
  pressao: { nome: 'Pressão atmosférica',     cor: '#38bdf8', dec: false },
  intens:  { nome: 'Intensidade da crise',    cor: '#f87171', dec: false },
  sono:    { nome: 'Sono',                    cor: '#a78bfa', dec: true },
  agua:    { nome: 'Água',                    cor: '#2dd4bf', dec: true },
  passos:  { nome: 'Passos',                  cor: '#34d399', dec: true },
  stress:  { nome: 'Stress',                  cor: '#fbbf24', dec: false },
  energia: { nome: 'Energia',                 cor: '#60a5fa', dec: false },
  hrv:     { nome: 'HRV',                     cor: '#f472b6', dec: true },
  peso:    { nome: 'Peso',                    cor: '#818cf8', dec: true },
  kcal:    { nome: 'Calorias das refeições',  cor: '#fb923c', dec: true },
};

let _memoria = null;
const periodoAtual = () => {
  const n = +(route.sub || '');
  return PERIODOS.some(p => p.d === n) ? n : 30;
};

/* ---------------------------------------------------------------- dados --- */

async function construirConjunto(n) {
  const chaves = dias(n);
  const registos = await diasComDados(chaves);
  const cs = await crises(n);
  const rs = await refeicoes(n);
  const mediaClima = pressaoMediaDiaria();
  const porChave = Object.fromEntries(registos.map(r => [r.data, r]));

  const pressaoDia = {};
  for (const k of chaves) {
    const r = porChave[k];
    pressaoDia[k] = mediaClima[k] ?? (r && r.pressaoHpa != null ? r.pressaoHpa : null);
  }

  const crisesDia = {};
  for (const c of cs) {
    const cur = crisesDia[c.data] || { n: 0, max: 0 };
    cur.n += 1; cur.max = Math.max(cur.max, c.intensidade || 0);
    crisesDia[c.data] = cur;
  }

  const kcalDia = {};
  for (const r of rs) if (r.calorias) kcalDia[r.data] = (kcalDia[r.data] || 0) + r.calorias;

  const col = (fn) => Object.fromEntries(chaves.map(k => [k, fn(k)]));
  const vals = {
    pressao: pressaoDia,
    intens:  col(k => (crisesDia[k] ? crisesDia[k].max : null)),
    sono:    col(k => (porChave[k]?.sonoHoras ?? null)),
    agua:    col(k => (porChave[k]?.aguaMl || null)),
    passos:  col(k => (porChave[k]?.passos ?? null)),
    stress:  col(k => (porChave[k]?.stress ?? null)),
    energia: col(k => (porChave[k]?.energia ?? null)),
    hrv:     col(k => (porChave[k]?.hrvMs ?? null)),
    peso:    col(k => (porChave[k]?.pesoKg ?? null)),
    kcal:    col(k => (kcalDia[k] || null)),
  };

  return { n, chaves, registos, cs, pressaoDia, crisesDia, vals };
}

/** Dias, crises e intensidade média agregados por banda de pressão. */
function porBanda({ chaves, pressaoDia, crisesDia }) {
  const acc = Object.fromEntries(BANDAS.map(b => [b.chave, { dias: 0, crises: 0, soma: 0, n: 0 }]));
  for (const k of chaves) {
    const a = acc[bandaPressao(pressaoDia[k])];
    if (!a) continue;
    a.dias += 1;
    if (crisesDia[k]) { a.crises += crisesDia[k].n; a.soma += crisesDia[k].max; a.n += 1; }
  }
  return BANDAS.map(b => {
    const a = acc[b.chave];
    return { ...b, dias: a.dias, crises: a.crises, media: a.n ? a.soma / a.n : null };
  });
}

function contar(cs, campo, chaves) {
  const m = new Map(chaves.map(k => [k, 0]));
  for (const c of cs) for (const v of (c[campo] || [])) if (m.has(v)) m.set(v, m.get(v) + 1);
  return m;
}
const topGatilhos = (cs) => [...contar(cs, 'gatilhos', GATILHOS).entries()]
  .filter(([, v]) => v).sort((a, b) => b[1] - a[1]).slice(0, 8)
  .map(([k, v]) => ({ rotulo: k, valor: v, cor: '#fbbf24' }));
const topZonas = (cs) => [...contar(cs, 'zonas', ZONAS_CABECA.map(z => z.id)).entries()]
  .filter(([, v]) => v).sort((a, b) => b[1] - a[1])
  .map(([id, v]) => ({ rotulo: (ZONAS_CABECA.find(z => z.id === id) || {}).nome || id, valor: v, cor: '#f87171' }));
const pontosDispersao = (cs) => cs.filter(c => c.pressaoInicioHpa != null).map(c => ({
  x: c.pressaoInicioHpa, y: c.intensidade || 0, rotulo: `${dataCurta(new Date(c.dataInicio))} · ${c.intensidade}/10`,
}));

/* --------------------------------------------------------------- render --- */

export async function render() {
  const n = periodoAtual();
  const dados = await construirConjunto(n);
  const s = await settings();
  const { chaves, pressaoDia, crisesDia, cs, registos } = dados;

  const gatilhos = topGatilhos(cs);
  const zonas = topZonas(cs);
  const dispersaoPts = pontosDispersao(cs);
  _memoria = Object.assign(_memoria || {}, dados, {
    localidade: s.localidade, gatilhos, zonas, dispersaoPts,
  });

  const diasComPressao = chaves.filter(k => pressaoDia[k] != null).length;
  const diasComCrise = chaves.filter(k => crisesDia[k]);
  const intensidades = cs.map(c => c.intensidade).filter(v => v != null);
  const mediaInt = intensidades.length ? intensidades.reduce((a, b) => a + b, 0) / intensidades.length : null;
  const duracoes = cs.filter(c => c.dataFim)
    .map(c => { const h = (new Date(c.dataFim) - new Date(c.dataInicio)) / 36e5; return h > 0 && h < 300 ? h : null; })
    .filter(v => v != null);
  const comDelta = cs.filter(c => c.deltaPressao6hHpa != null);
  const quedaAntes = comDelta.filter(c => c.deltaPressao6hHpa <= -2).length;

  const bandas = porBanda(dados);
  const maxBanda = Math.max(1, ...bandas.map(b => b.crises));

  return `
    <div class="fade-in" data-print>
      ${cabecalho({
        kicker: 'Relatórios e análise',
        titulo: 'Correlação com o clima',
        sub: `${dataLonga(chaves[0])} — ${dataLonga(chaves.at(-1))} · ${s.localidade}`,
      })}

      <div class="chips mt8">
        ${PERIODOS.map(p => `<button class="chip" data-periodo="${p.d}" aria-pressed="${p.d === n}">${p.nome}</button>`).join('')}
        <button class="chip" data-acao="pdf">${ICON.imprimir} PDF</button>
      </div>

      ${!cs.length && registos.length < 3 ? `
        <div class="section">${vazio('Ainda há poucos dados',
          'Registe crises e dias no diário, ou importe o Apple Saúde / Garmin. Os gráficos ganham forma a partir de uma semana de registos.',
          `<button class="btn btn-sm" data-acao="ir-diario">${ICON.lapis} Abrir o diário</button>`)}</div>` : ''}

      <div class="section">
        <div class="stats">
          <div class="stat"><b>${cs.length}</b><span>crises no período</span></div>
          <div class="stat"><b>${mediaInt == null ? '—' : fmt(mediaInt, 1)}</b><span>intensidade média</span></div>
          <div class="stat"><b>${duracoes.length ? fmt(duracoes.reduce((a, b) => a + b, 0) / duracoes.length, 1) : '—'}</b><span>duração média · h</span></div>
          <div class="stat"><b>${diasComCrise.length}</b><span>dias com crise</span></div>
          <div class="stat"><b>${diasComPressao}</b><span>dias com pressão real</span></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Pressão atmosférica vs crises</div>
        <div class="card">
          <div class="chart" data-chart="pressao" data-altura="220"></div>
          <div class="legend">
            <span><i style="background:#38bdf8"></i>pressão média do dia · hPa</span>
            <span><i style="background:#f87171"></i>intensidade máxima · escala da direita</span>
          </div>
          <p class="muted mt8">${diasComPressao < chaves.length
            ? `Sem leitura de pressão em ${chaves.length - diasComPressao} dia(s) — a série horária do Open-Meteo só cobre os dias recentes.`
            : 'Série horária do Open-Meteo completa para esta localidade.'}</p>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Crises por banda de pressão</div>
        <div class="card">
          ${bandas.map(b => {
            const cls = b.crises === 0 ? 'ok' : b.chave === '<1000 hPa' ? 'high'
              : b.chave === '1000–1007 hPa' ? 'low' : 'none';
            const larg = Math.max(20, (b.crises / maxBanda) * 100);
            return `
              <div class="corr-row">
                <div class="corr-key">${esc(b.titulo)}<b>${esc(b.chave)}</b></div>
                <div class="corr-track">
                  <div class="corr-fill ${cls}" style="width:${larg}%">${
                    b.crises
                      ? `${b.crises} crise${b.crises > 1 ? 's' : ''}${b.media != null ? ` · média ${fmt(b.media, 1)}/10` : ''}`
                      : 'sem crises'}</div>
                </div>
              </div>
              <p class="muted" style="font-size:11.5px;margin:-4px 0 12px 107px">${b.dias} dia${b.dias === 1 ? '' : 's'} nesta banda · ${esc(b.nota)}</p>`;
          }).join('')}
          <p class="hint mt8">Intensidade média nos dias em que a pressão diária caiu dentro de cada banda.</p>
        </div>
      </div>

      ${comDelta.length ? `
        <div class="section">
          <div class="section-title">Variação de pressão nas 6 h anteriores</div>
          <div class="card card-tight">
            <div class="kv"><span>Crises com pressão capturada</span><span>${comDelta.length} de ${cs.length}</span></div>
            <div class="kv"><span>Precedidas por queda ≥ 2 hPa</span><span style="color:var(--amber)">${quedaAntes}</span></div>
            <div class="kv"><span>Variação média</span><span>${fmt(comDelta.reduce((a, c) => a + c.deltaPressao6hHpa, 0) / comDelta.length, 1)} hPa</span></div>
          </div>
        </div>` : ''}

      <div class="section">
        <div class="section-title">Comparar duas variáveis</div>
        <div class="card">
          <div class="grid2">
            <label class="fld" style="margin-bottom:0"><span>Linha · eixo esquerdo</span>
              <select data-var="linha">
                ${Object.entries(VARIAVEIS).map(([k, v]) =>
                  `<option value="${k}"${k === 'pressao' ? ' selected' : ''}>${esc(v.nome)}</option>`).join('')}
              </select></label>
            <label class="fld" style="margin-bottom:0"><span>Barras · eixo direito</span>
              <select data-var="barras">
                ${Object.entries(VARIAVEIS).map(([k, v]) =>
                  `<option value="${k}"${k === 'intens' ? ' selected' : ''}>${esc(v.nome)}</option>`).join('')}
              </select></label>
          </div>
          <div class="chart mt8" data-chart="comparar" data-altura="230"></div>
          <div class="legend" data-legenda></div>
        </div>
      </div>

      ${dispersaoPts.length >= 3 ? `
        <div class="section">
          <div class="section-title">Pressão no início da crise × intensidade</div>
          <div class="card">
            <div class="chart" data-chart="dispersao" data-altura="210"></div>
            <p class="muted mt8">Cada ponto é uma crise; o tamanho acompanha a intensidade. Pressão registada no minuto em que a crise começou.</p>
          </div>
        </div>` : ''}

      ${gatilhos.length ? `
        <div class="section">
          <div class="section-title">Gatilhos assinalados</div>
          <div class="card"><div class="chart" data-chart="gatilhos"></div></div>
        </div>` : ''}

      ${zonas.length ? `
        <div class="section">
          <div class="section-title">Zonas da cabeça afetadas</div>
          <div class="card"><div class="chart" data-chart="zonas"></div></div>
        </div>` : ''}

      <div class="note mt16">
        <b>Correlação não é causalidade.</b> Este relatório descreve apenas o que foi registado neste período
        (${chaves.length} dias). Serve de ponto de partida para a conversa com o seu médico — não é diagnóstico
        nem recomendação de tratamento.
        ${clima.erro ? `<br><em>Clima: ${esc(clima.erro)} — os dias sem leitura aparecem em falta.</em>` : ''}
      </div>

      <div class="btn-row mt16">
        <button class="btn btn-block" data-acao="pdf">${ICON.imprimir} Preparar PDF para o médico</button>
      </div>
      <p class="hint mt8">Na pré-visualização escolha «Guardar como PDF». A folha de impressão troca o tema para fundo claro e esconde a barra de navegação.</p>
    </div>`;
}

/* ---------------------------------------------------------------- bind ---- */

const larguraDe = (node, minimo) => Math.max(minimo, Math.floor(node.getBoundingClientRect().width) || 320);

function desenharPressao(root) {
  const box = root.querySelector('[data-chart="pressao"]');
  if (!box || !_memoria) return;
  box.innerHTML = chartPressaoVsCrises({
    dias: _memoria.chaves, pressaoDia: _memoria.pressaoDia, crisesDia: _memoria.crisesDia,
    largura: larguraDe(box, 300), altura: +(box.dataset.altura || 220),
  });
}

function desenharComparar(root) {
  const box = root.querySelector('[data-chart="comparar"]');
  if (!box || !_memoria) return;
  const lk = root.querySelector('[data-var="linha"]')?.value || 'pressao';
  const bk = root.querySelector('[data-var="barras"]')?.value || 'intens';
  const l = VARIAVEIS[lk], b = VARIAVEIS[bk];
  const mesmas = lk === bk;
  box.innerHTML = chartRelacao({
    dias: _memoria.chaves,
    largura: larguraDe(box, 280),
    altura: +(box.dataset.altura || 230),
    linha:  { vals: _memoria.vals[lk], nome: l.nome, cor: l.cor, dec: l.dec },
    barras: mesmas ? null : { vals: _memoria.vals[bk], nome: b.nome, cor: b.cor },
  });
  const leg = root.querySelector('[data-legenda]');
  if (leg) leg.innerHTML =
    `<span><i style="background:${l.cor}"></i>${esc(l.nome)}</span>` +
    (mesmas ? '' : `<span><i style="background:${b.cor};opacity:.6"></i>${esc(b.nome)}</span>`);
}

function desenharTodos(root) {
  desenharPressao(root);

  const d = root.querySelector('[data-chart="dispersao"]');
  if (d && _memoria?.dispersaoPts?.length) {
    d.innerHTML = dispersao(_memoria.dispersaoPts, { largura: larguraDe(d, 280), altura: +(d.dataset.altura || 210) });
  }
  for (const [sel, chave] of [['gatilhos', 'gatilhos'], ['zonas', 'zonas']]) {
    const box = root.querySelector(`[data-chart="${sel}"]`);
    if (box && _memoria?.[chave]?.length) box.innerHTML = barrasHorizontais(_memoria[chave], { largura: larguraDe(box, 260) });
  }
  desenharComparar(root);
}

export async function bind(root) {
  on(root, 'click', '[data-periodo]', (e, b) => {
    const n = +b.dataset.periodo;
    if (n === periodoAtual()) return;
    haptic(6);
    go('relatorios', String(n));   // o render pede os dias de clima que faltarem
  });

  on(root, 'click', '[data-acao]', (e, b) => {
    if (b.dataset.acao === 'pdf') { haptic(8); confirmarImpressao(); }
    if (b.dataset.acao === 'ir-diario') go('sintomas', 'diario');
  });

  root.querySelectorAll('[data-var]').forEach(sel => { sel.onchange = () => desenharComparar(root); });

  desenharTodos(root);

  // o clima pode chegar (ou atualizar-se) depois de o ecrã estar aberto
  const parar = observarClima(() => {
    if (!root.isConnected) { parar(); return; }
    if (!_memoria?.chaves) return;
    const media = pressaoMediaDiaria();
    // chegaram dias que faltavam: vale mais reconstruir o relatório todo
    // (KPIs, bandas e Δ6h) do que só redesenhar as curvas.
    if (_memoria.chaves.some(k => _memoria.pressaoDia[k] == null && media[k] != null)) {
      refresh();
      return;
    }
    for (const k of _memoria.chaves) {
      _memoria.pressaoDia[k] = media[k] ?? _memoria.pressaoDia[k] ?? null;
      _memoria.vals.pressao = _memoria.pressaoDia;
    }
    desenharPressao(root);
    desenharComparar(root);
  });

  // O arranque carrega 45 dias; um relatório de 90 dias precisa da série longa.
  const n = periodoAtual();
  if (n > 45) atualizarClima({ diasAtras: n });
}

/* ---------------------------------------------------------- export PDF ---- */

function confirmarImpressao() {
  const m = _memoria;
  const corpo = el(`<div>
    <p class="hint">O PDF é gerado pelo próprio navegador — nada sai do seu dispositivo.</p>
    <div class="kv"><span>Período</span><span>${m ? `${dataLonga(m.chaves[0])} — ${dataLonga(m.chaves.at(-1))}` : '—'}</span></div>
    <div class="kv"><span>Localidade das leituras</span><span>${esc(m?.localidade || '—')}</span></div>
    <div class="kv"><span>Crises incluídas</span><span>${m ? m.cs.length : 0}</span></div>
    <div class="note warn mt12">Na janela de impressão escolha <b>Guardar como PDF</b>. O fundo passa a claro e a barra de navegação desaparece.</div>
  </div>`);
  const { fechar } = sheet({
    titulo: 'Exportar relatório', sub: 'PDF para o médico', corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Cancelar</button>
            <button class="btn btn-primary" data-imprimir>Imprimir / PDF</button>`,
  });
  corpo.closest('.sheet').querySelector('[data-imprimir]').onclick = () => {
    fechar();
    toast('A abrir a pré-visualização de impressão…');
    setTimeout(() => window.print(), 150);
  };
}
