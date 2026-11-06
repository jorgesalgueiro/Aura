/* ==========================================================================
   screens/dashboard.js — Ecrã 1 · Dashboard Diário
   Resumo passivo do dia + barómetro atmosférico real + atalhos < 5 s
   ========================================================================== */

import {
  diaKey, getDia, settings, criseAtiva, crises, tomasDoDia, farmacia, refeicoes,
} from '../store.js';
import { esc, fmt, el, dataLonga, ICON, on, haptic } from '../utils.js';
import { anel, sparkline, barrasSono, corIntensidade } from '../charts.js';
import { clima, ultimasHoras, observarClima } from '../clima.js';
import { metrico, atalho } from './parts.js';
import {
  sheetAgua, sheetTomas, sheetCrise, sheetDigestivo, sheetRefeicao, cardCriseAtiva,
} from './acoes.js';
import { go, refresh } from '../nav.js';
import { sheetImportar } from '../health-import.js';
import { deveMostrarCartao, cartaoInstalarHTML, sheetInstalar, dispensarCartao } from '../instalar.js';
import { ligacao as ligacaoGarmin, sincronizarAgora } from '../intervals.js';

const hora = () => new Date().getHours();
const saudacao = () =>
  hora() < 6 ? 'Boa madrugada' : hora() < 13 ? 'Bom dia' : hora() < 20 ? 'Boa tarde' : 'Boa noite';

/** Cartão do barómetro — reutilizado no arranque e quando o clima é atualizado. */
export function barometroHTML(localidade, largura = 300) {
  const r = clima.risco;
  const a = clima.atual;
  const corDelta = clima.delta6h == null ? ''
    : clima.delta6h <= -2 ? 'var(--red)' : clima.delta6h >= 2 ? 'var(--sky)' : 'var(--green)';
  return `
    <div class="section-title">Barómetro atmosférico</div>
    <div class="card card-accent">
      <div class="split">
        <div>
          <div class="metric-label">${esc(localidade)} · pressão ao nível do mar</div>
          <div class="metric-value">${a ? fmt(a.hpa, 1) : '—'}<small>hPa</small></div>
          <div class="metric-foot">${clima.delta6h == null ? 'a consultar o histórico de pressão…' :
            `Variação nas últimas 6 h: <b style="color:${corDelta}">${clima.delta6h > 0 ? '+' : ''}${fmt(clima.delta6h, 1)} hPa</b>`}</div>
        </div>
        <div style="text-align:right">
          <span class="badge ${r.cor || 'blue'}"><i class="dot"></i>${esc(r.label)}</span>
          <div class="metric-value" style="margin-top:8px">${a ? fmt(a.temp, 1) : '—'}<small>°C</small></div>
          <div class="metric-foot">${a && a.sensacao != null ? `sensação ${fmt(a.sensacao, 1)}° · hum. ${fmt(a.humidade)}%` : ''}</div>
        </div>
      </div>
      <div class="mt12" data-spark>${sparkline(ultimasHoras(30), { largura, altura: 46, cor: '#38bdf8' })}</div>
      <p class="muted mt8" style="text-align:right">${
        clima.erro ? `⚠ ${esc(clima.erro)} — a mostrar a última leitura guardada`
        : `Dados Open-Meteo · atualizados a cada 10 min${clima.feitoEm ? ' às ' + String(clima.feitoEm.getHours()).padStart(2, '0') + ':' + String(clima.feitoEm.getMinutes()).padStart(2, '0') : ''}`
      }</p>
    </div>
    <div class="note" style="margin-top:12px">
      <b>Leitura meteorológica</b> — descidas rápidas de pressão são um gatilho conhecido de enxaqueca.
      Quando iniciar uma crise, a variação das 6 horas anteriores fica automaticamente associada ao registo.
      <em>Indicativo, não é aconselhamento médico.</em>
    </div>`;
}

export async function render() {
  const hoje = diaKey();
  const s = await settings();
  const dia = await getDia(hoje);
  const crise = await criseAtiva();
  const itens = (await farmacia()).filter(i => i.ativo !== false);
  const tomas = await tomasDoDia(hoje);
  const crises7 = (await crises(7)).filter(c => c.dataFim);
  const refeicoesHoje = (await refeicoes(1)).filter(r => r.data === hoje);

  const esperadas = itens.reduce((a, i) => a + (i.tomarAs?.length || 0), 0);
  const ultimas7 = await Promise.all(Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i); return getDia(diaKey(d));
  }));
  const pesoAnterior = ultimas7.slice(1).find(x => x.pesoKg != null)?.pesoKg;
  const deltaPeso = dia.pesoKg != null && pesoAnterior != null ? dia.pesoKg - pesoAnterior : null;
  const sonoOrigem = dia.origem?.sonoHoras;
  const temSensores = [dia.sonoHoras, dia.pesoKg, dia.passos, dia.hrvMs, dia.kcalAtivas].some(v => v != null);
  const mostrarInstalar = await deveMostrarCartao();
  const garmin = await ligacaoGarmin();

  const html = [];

  html.push(`
    <div class="screen-head">
      <div class="screen-kicker">${esc(dataLonga(hoje))}</div>
      <h1 class="screen-title">${saudacao()}${s.nome ? ', ' + esc(s.nome) : ''}</h1>
      <p class="screen-sub">${
        crise ? 'Existe uma crise a decorrer — o cronómetro está ativo.'
        : crises7.length ? `${crises7.length} crise${crises7.length > 1 ? 's' : ''} nos últimos 7 dias.`
        : 'Sem crises registadas nos últimos 7 dias.'
      }</p>
    </div>`);

  /* ------------------------------------------------ instalar a app ----- */
  if (mostrarInstalar) html.push(`<div class="section">${cartaoInstalarHTML()}</div>`);

  /* ---------------------------------------------------- Atalhos rápidos -- */
  html.push(`
    <div class="section">
      <div class="section-title">Registo rápido</div>
      <div class="grid2">
        ${atalho({ icone: 'agua', texto: 'Água', valor: `${fmt(dia.aguaMl)} ml`, accao: 'agua', vivo: dia.aguaMl > 0 && dia.aguaMl < s.objetivoAguaMl })}
        ${atalho({ icone: 'pilula', texto: 'Medicação', valor: esperadas ? `${tomas.length}/${esperadas}` : `${tomas.length} tomas`, accao: 'tomas' })}
        ${atalho({ icone: 'raio', texto: 'Iniciar crise', valor: crise ? 'em curso' : 'cronómetro', accao: 'crise', vivo: !!crise })}
        ${atalho({ icone: 'escama', texto: 'Registo digestivo', accao: 'digestivo' })}
        ${atalho({ icone: 'comida', texto: 'Refeição', valor: refeicoesHoje.length ? `${refeicoesHoje.length} hoje` : '', accao: 'refeicao' })}
        ${atalho({ icone: 'cerebro', texto: 'Energia e stress', valor: dia.energia != null ? `${dia.energia}/10` : '', accao: 'estado' })}
      </div>
    </div>`);

  /* -------------------------------------------------- Barómetro / clima -- */
  html.push(`
    <div class="section" data-barometro>${barometroHTML(s.localidade)}</div>`);

  /* ------------------------------------------------- Cartões de widgets -- */
  const sonoMin = (dia.sonoProfundoMin || 0) + (dia.sonoREMmin || 0) + (dia.sonoLeveMin || 0);
  html.push(`
    <div class="section">
      <div class="section-title">Sono, corpo e movimento</div>
      <div class="grid2">
        ${metrico({
          icone: 'sono', cor: 'violet', label: 'Sono', valor: fmt(dia.sonoHoras, 1), unidade: 'h',
          foot: sonoMin
            ? `<div class="mt8">${barrasSono({ profundo: dia.sonoProfundoMin, rem: dia.sonoREMmin, leve: dia.sonoLeveMin }, { largura: 130, altura: 9 })}</div>
              <span class="muted">profundo ${fmt((dia.sonoProfundoMin || 0) / 60, 1)} h · REM ${fmt((dia.sonoREMmin || 0) / 60, 1)} h</span>`
            : (temSensores ? 'sem detalhe de fases' : 'importe do Apple Saúde ou Garmin'),
        })}
        ${metrico({
          icone: 'peso', cor: 'teal', label: 'Peso', valor: fmt(dia.pesoKg, 1), unidade: 'kg',
          foot: deltaPeso == null ? (temSensores ? 'sem histórico' : '—')
            : `${deltaPeso > 0.05 ? '▲' : deltaPeso < -0.05 ? '▼' : '='} ${fmt(Math.abs(deltaPeso), 1)} kg vs último registo`,
        })}
        ${metrico({ icone: 'passo', cor: 'green', label: 'Passos', valor: fmt(dia.passos), unidade: '', foot: dia.passos ? 'meta pessoal 8 000' : 'sem sincronização' })}
        ${metrico({ icone: 'coracao', cor: 'amber', label: 'HRV', valor: fmt(dia.hrvMs, 0), unidade: 'ms', foot: dia.hrvMs ? 'variabilidade da frequência cardíaca' : 'sem sincronização' })}
      </div>
      <div class="grid2 mt12">
        ${metrico({ icone: 'raio', cor: 'amber', label: 'Calorias ativas', valor: fmt(dia.kcalAtivas), unidade: 'kcal', foot: dia.kcalAtivas ? 'do treino de ontem/hoje' : 'sem sincronização' })}
        ${metrico({ icone: 'cerebro', cor: 'blue', label: 'Estado geral', valor: dia.energia != null ? `${dia.energia}` : '—', unidade: dia.energia != null ? '/10' : '',
          foot: dia.stress != null ? `stress ${dia.stress}/10` : 'registe energia e stress' })}
      </div>
      ${temSensores
        ? `<p class="muted mt12">Origem dos números: ${esc([...new Set(Object.values(dia.origem || {}))].map(o => ({ healthkit: 'Apple Saúde', garmin: 'Garmin', 'open-meteo': 'Open-Meteo', manual: 'manual' }[o] || o)).join(', ') || '—')}</p>`
        : `<div class="btn-row mt12">
            <button class="btn btn-sm" data-acao="importar">${ICON.upload} Importar Apple Saúde / Garmin</button>
          </div>
          <p class="muted" style="margin-top:8px">O Safari não lê o HealthKit a partir de uma web app. A importação faz-se no iPhone com o export oficial — veja as instruções dentro da folha de importação.</p>`}
      ${garmin.ativo ? `<div class="btn-row mt12">
        <button class="btn btn-sm btn-ghost" data-acao="garmin-sync">${ICON.download} Sincronizar Garmin</button>
      </div>` : ''}
    </div>`);

  /* --------------------------------------------------------- hidratação -- */
  const pct = Math.min(1, dia.aguaMl / s.objetivoAguaMl);
  html.push(`
    <div class="section">
      <div class="section-title">Hidratação e medicação</div>
      <div class="grid2">
        <div class="card center">
          <div class="ring" style="margin:2px auto 8px">
            ${anel({ valor: dia.aguaMl, total: s.objetivoAguaMl, tamanho: 122, espessura: 12 })}
            <div class="ring-txt"><b>${Math.round(pct * 100)}%</b><small>${fmt(dia.aguaMl)} / ${fmt(s.objetivoAguaMl)} ml</small></div>
          </div>
          <button class="btn btn-sm btn-block" data-acao="agua">Adicionar água</button>
        </div>
        <div class="card">
          <div class="metric-label">Tomadas hoje</div>
          <div class="metric-value">${tomas.length}<small>${esperadas ? ` de ${esperadas}` : ''}</small></div>
          <div class="list mt12" style="max-height:132px;overflow:auto">
            ${tomas.length ? tomas.map(t => {
              const it = itens.find(i => i.id === t.itemId);
              return `<div class="row"><span class="row-ico" style="background:rgba(45,212,191,.14);color:var(--cyan)">${ICON.pilula}</span>
                <div class="row-main"><div class="row-title">${esc(it?.nome || 'item removido')}</div>
                <div class="row-sub">${esc(it?.dosagem || '')}</div></div>
                <div class="row-end">${esc(t.hora)}</div></div>`;
            }).join('') : `<div class="empty" style="padding:22px">Sem tomas registadas hoje.</div>`}
          </div>
          <button class="btn btn-sm btn-block mt12" data-acao="tomas">Marcar toma</button>
        </div>
      </div>
    </div>`);

  /* ------------------------------------------------- últimas crises + nota */
  if (crises7.length) {
    html.push(`
      <div class="section">
        <div class="section-title">Últimas crises</div>
        <div class="list">
          ${crises7.slice(0, 4).map(c => `
            <div class="row">
              <span class="row-ico" style="background:${corIntensidade(c.intensidade)}22;color:${corIntensidade(c.intensidade)}">${ICON.cabeca}</span>
              <div class="row-main"><div class="row-title">Intensidade ${c.intensidade}/10</div>
                <div class="row-sub">${esc(dataLonga(c.data))} · ${esc(new Date(c.dataInicio).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }))}
                ${c.deltaPressao6hHpa != null ? ` · Δ6 h ${c.deltaPressao6hHpa > 0 ? '+' : ''}${fmt(c.deltaPressao6hHpa, 1)} hPa` : ''}</div></div>
              <div class="row-end">${esc(c.tempoAntesMin ? Math.round(c.tempoAntesMin / 6) / 10 + ' h' : '—')}</div>
            </div>`).join('')}
        </div>
        <div class="btn-row mt12"><button class="btn btn-sm btn-ghost" data-acao="ver-relatorios">${ICON.grafico} Ver correlação com o clima</button></div>
      </div>`);
  }

  if (dia.notas) {
    html.push(`<div class="section"><div class="section-title">Notas de hoje</div>
      <div class="card"><p style="margin:0;font-size:14.5px">${esc(dia.notas)}</p></div></div>`);
  }

  const host = el(`<div class="fade-in">${html.join('')}</div>`);
  if (crise) {
    // cartão com cronómetro a avançar, logo abaixo do cabeçalho
    host.querySelector('.screen-head').after(cardCriseAtiva(crise, { aoTerminar: () => refresh() }));
  }
  return host;
}

/* --------------------------------------------------------------- bind -- */

const ACCOES = {
  agua: () => sheetAgua(),
  tomas: () => sheetTomas(),
  crise: () => sheetCrise(),
  digestivo: () => sheetDigestivo(),
  refeicao: () => sheetRefeicao(),
  estado: () => go('sintomas', 'estado'),
  importar: () => sheetImportar(),
  instalar: () => sheetInstalar(),
  'instalar-dispensar': async () => { await dispensarCartao(); haptic(6); refresh(); },
  'garmin-sync': async () => {
    const r = await sincronizarAgora({ dias: 7 });
    if (r && r.dias) refresh();
  },
  'ver-relatorios': () => go('relatorios'),
};

export async function bind(root) {
  on(root, 'click', '[data-acao]', (e, b) => {
    const fn = ACCOES[b.dataset.acao];
    if (fn) { haptic(8); fn(); }
  });
  on(root, 'click', '[data-goto]', (e, b) => {
    const [tab, sub] = (b.dataset.goto || '').split('/');
    if (tab) go(tab, sub);
  });

  // o sparkline ajusta-se à largura real do cartão
  const spark = root.querySelector('[data-spark]');
  if (spark) {
    const w = Math.max(200, Math.floor(spark.getBoundingClientRect().width) || 300);
    spark.innerHTML = sparkline(ultimasHoras(30), { largura: w, altura: 46, cor: '#38bdf8' });
  }

  // quando o clima chega / é atualizado, só redesenha o barómetro
  const localidade = (await settings()).localidade;
  const desenharBarometro = () => {
    if (!root.isConnected) { parar(); return; }
    const sec = root.querySelector('[data-barometro]');
    if (!sec) return;
    const w = Math.max(200, Math.floor(sec.getBoundingClientRect().width) || 300);
    sec.innerHTML = barometroHTML(localidade, w);
  };
  const parar = observarClima(desenharBarometro);
  desenharBarometro();
}
