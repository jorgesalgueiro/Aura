/* ==========================================================================
   health-import.js — importação real de dados do Apple Saúde e do Garmin
   -------------------------------------------------------------------------
   Uma web app no iOS não consegue ler o HealthKit (só apps nativas).
   O percurso oficial é exportar e voltar a importar:
     · Apple Saúde → export.xml   (<Record> / <ActivitySummary>)
     · Garmin Connect → CSV diário (Steps, Weight, Sleep…)
     · CSV genérico com colunas de data + métrica
   Esta camada lê esses ficheiros, agrega por dia e escreve em RegistoDiario
   marcando a origem ('healthkit' | 'garmin' | 'importado').
   ========================================================================== */

import { patchDia } from './store.js';
import { el, esc, sheet, toast, fmt, haptic, ICON, dataLonga } from './utils.js';

/* ------------------------------------------------------------- utils ----- */

const ISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "2021-03-14 08:00:00 -0800" | ISO | "14-03-2021" | "03/14/2021" → Date local. */
function parseDataHora(bruto) {
  if (!bruto) return null;
  const s = String(bruto).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) {
    const a = +m[1], b = +m[2];
    return a > 12
      ? new Date(+m[3], b - 1, a, 12, 0, 0)          // dd/mm/aaaa
      : new Date(+m[3], a - 1, b, 12, 0, 0);         // mm/dd/aaaa (formato Garmin)
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "1.234,5" | "1 234" | "7h 12m" | "07:12:00" → número. */
function num(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, '');
  if (!s || /^--?$/.test(s)) return null;
  const hm = s.match(/^(\d+(?:[.,]\d+)?)h(\d+(?:[.,]\d+)?)m?$/i);
  if (hm) return +hm[1].replace(',', '.') + +hm[2] / 60;
  if (/^(\d{1,3}):(\d{2})(:\d{2})?$/.test(s)) {
    const p = s.split(':');
    return +p[0] + +p[1] / 60 + +(p[2] || 0) / 3600;
  }
  const limpo = s.replace(/[^0-9.,-]/g, '');
  if (!limpo) return null;
  // vírgula é decimal quando não existe ponto de milhar
  const normal = /,/.test(limpo) && !/\./.test(limpo) ? limpo.replace(',', '.') : limpo.replace(/,/g, '');
  const val = parseFloat(normal);
  return Number.isFinite(val) ? val : null;
}

/**
 * Duração em minutos a partir de "7h 12m", "07:12", "432" ou "7,2".
 * `dica` é o nome da coluna: um cabeçalho com "(minutes)", "(h)" ou "(s)"
 * resolve os números soltos; sem ele só resta a magnitude.
 */
function minutos(v, dica = '') {
  const n = num(v);
  if (n == null) return null;
  const s = String(v);
  if (/min/i.test(s)) return n;
  if (/h|hour|godz/i.test(s) || /^(\d{1,3}):(\d{2})/.test(s)) return Math.round(n * 60);
  const cab = String(dica);
  if (/\(s\)|second|segund/i.test(cab)) return Math.round(n / 60);
  if (/(?:\(|\s)min/i.test(cab)) return Math.round(n);
  if (/\bh\b|\(h\)|hour|heure|hora/i.test(cab)) return Math.round(n * 60);
  return n > 180 ? n : Math.round(n * 60);   // número puro: minutos ou horas
}

const novoDia = (chave) => ({
  chave, pesoKg: null, pesoTs: 0, passos: 0, kcalAtivas: 0, hrvMs: null, hrvN: 0,
  profundo: 0, rem: 0, leve: 0, sonoDesc: 0, naCama: 0,
  temPassos: false, temEnergia: false, temSono: false,
  sonoHorasMin: null, sonoProfundoMin: null, sonoREMmin: null, sonoLeveMin: null,
});

/** Combina um dia importado num bucket já existente (vários ficheiros). */
function combinar(base, novo) {
  if (novo.pesoKg != null && novo.pesoTs >= base.pesoTs) { base.pesoKg = novo.pesoKg; base.pesoTs = novo.pesoTs; }
  if (novo.passos) base.passos = Math.max(base.passos, novo.passos);
  if (novo.kcalAtivas) base.kcalAtivas = Math.max(base.kcalAtivas, novo.kcalAtivas);
  if (novo.hrvMs != null) base.hrvMs = novo.hrvMs;
  if (novo.origem) base.origem = novo.origem;   // de onde veio este dia
  base.temPassos = base.temPassos || novo.temPassos;
  base.temEnergia = base.temEnergia || novo.temEnergia;
  if (novo.temSono) {
    base.temSono = true;
    base.sonoHorasMin = novo.sonoHorasMin ?? base.sonoHorasMin;
    base.sonoProfundoMin = novo.sonoProfundoMin ?? base.sonoProfundoMin;
    base.sonoREMmin = novo.sonoREMmin ?? base.sonoREMmin;
    base.sonoLeveMin = novo.sonoLeveMin ?? base.sonoLeveMin;
  }
  return base;
}

/* ------------------------------------------------------ Apple Saúde ----- */

function attrs(str) {
  const o = {};
  const re = /([\w-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(str))) o[m[1]] = m[2];
  return o;
}

const RE_RECORD = /<Record\b([^>]*?)\/?>/g;
const RE_SUMMARY = /<ActivitySummary\b([^>]*?)\/?>/g;

/** Analisador incremental do export.xml (alimentar recebe texto até um '>'). */
function analisadorApple() {
  const dias = new Map();
  const sumarios = new Map();
  const campos = new Set();
  const avisos = [];
  let ignorados = 0;

  const bucket = (chave) => {
    let d = dias.get(chave);
    if (!d) { d = novoDia(chave); dias.set(chave, d); }
    return d;
  };

  function tratarRecord(a) {
    const tipo = a.type || '';
    const inicio = parseDataHora(a.startDate);
    if (!inicio) { ignorados++; return; }
    const fim = parseDataHora(a.endDate) || inicio;
    const q = num(a.quantity);
    const un = (a.units || '').toLowerCase();

    if (/HKQuantityTypeIdentifierBodyMass(?!Index)/.test(tipo)) {
      if (q == null) return;
      let kg = q;
      if (/lb/.test(un)) kg *= 0.45359237;
      else if (/stone/.test(un)) kg *= 6.35029318;
      else if (/^g$|gram/.test(un)) kg /= 1000;
      if (!(kg > 2 && kg < 400)) return;
      const d = bucket(ISO(inicio));
      if (inicio.getTime() >= d.pesoTs) { d.pesoKg = kg; d.pesoTs = inicio.getTime(); }
      campos.add('peso');
    } else if (/StepCount/.test(tipo)) {
      const d = bucket(ISO(inicio));
      d.passos += q || 0; d.temPassos = true; campos.add('passos');
    } else if (/ActiveEnergyBurned/.test(tipo)) {
      const d = bucket(ISO(inicio));
      d.kcalAtivas += q || 0; d.temEnergia = true; campos.add('calorias');
    } else if (/HeartRateVariabilitySDNN/.test(tipo)) {
      if (q == null) return;
      const d = bucket(ISO(inicio));
      d.hrvMs = d.hrvMs == null ? q : (d.hrvMs * d.hrvN + q) / (d.hrvN + 1);
      d.hrvN += 1; campos.add('HRV');
    } else if (/SleepAnalysis|SleepAsleep|SleepInBed|SleepAwake/.test(tipo)) {
      const valor = a.value || '';
      const min = Math.max(0, (fim - inicio) / 6e4);
      // O sono pertence ao dia em que a pessoa acordou: um episódio que começa
      // no dia seguinte à meia-noite (00:00–11:59) conta para esse dia; tudo o
      // que começa depois do meio-dia é a primeira metade da noite seguinte.
      const ancora = new Date(inicio);
      if (inicio.getHours() >= 12) ancora.setDate(ancora.getDate() + 1);
      const d = bucket(ISO(ancora));
      if (/AsleepDeep/.test(valor)) d.profundo += min;
      else if (/REM/.test(valor)) d.rem += min;
      else if (/Core/.test(valor)) d.leve += min;
      else if (/Unspecified|SleepAsleep/.test(valor)) d.sonoDesc += min;
      else if (/InBed|SleepInBed/.test(valor)) d.naCama += min;
      d.temSono = true;
    } else ignorados++;
  }

  function tratarSummary(a) {
    const chave = (a.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chave)) return;
    // o atributo chama-se stepsCount no iOS recente e steps em exportações antigas
    sumarios.set(chave, { passos: num(a.stepsCount ?? a.steps), kcal: num(a.activeEnergyBurned) });
  }

  return {
    alimentar(texto) {
      let m;
      RE_RECORD.lastIndex = 0;
      while ((m = RE_RECORD.exec(texto))) tratarRecord(attrs(m[1]));
      RE_SUMMARY.lastIndex = 0;
      while ((m = RE_SUMMARY.exec(texto))) tratarSummary(attrs(m[1]));
    },
    finalizar() {
      // os totais oficiais do <ActivitySummary> têm prioridade sobre as somas
      for (const [chave, s] of sumarios) {
        const d = bucket(chave);
        if (s.passos != null) { d.passos = s.passos; d.temPassos = true; campos.add('passos'); }
        if (s.kcal != null) { d.kcalAtivas = s.kcal; d.temEnergia = true; campos.add('calorias'); }
      }
      for (const d of dias.values()) {
        if (!d.temSono) continue;
        const estagios = d.profundo + d.rem + d.leve;
        const total = estagios > 0 ? estagios : d.sonoDesc > 0 ? d.sonoDesc : d.naCama;
        d.temSono = false;
        if (!(total >= 60 && total <= 1080)) continue;
        d.temSono = true;
        d.sonoHorasMin = Math.round(total);
        if (estagios > 0) {
          d.sonoProfundoMin = Math.round(d.profundo);
          d.sonoREMmin = Math.round(d.rem);
          d.sonoLeveMin = Math.round(d.leve);
        }
        campos.add('sono');
      }
      if (!dias.size) avisos.push('O ficheiro não continha registos reconhecíveis (peso, passos, calorias, HRV ou sono).');
      return { formato: 'apple-health', origem: 'healthkit', dias, campos: [...campos], avisos, ignorados, nome: 'Apple Saúde · export.xml' };
    },
  };
}

/* -------------------------------------------------- Garmin / CSV geral -- */

const COLUNAS = [
  ['peso', /weight|peso|body.?mass|^kg$/i],
  ['passos', /steps|passos|nb.?de.?pas/i],
  ['kcal', /active.?(calorie|kcal)|^kcal$|calories.?active|calorias?.?(ativ|activ)/i],
  ['hrv', /hrv|sdnn|rr.?interval/i],
  ['profundo', /deep.?(sleep|min|session)|sleep.?deep|profond/i],
  ['rem', /rem.?(sleep|min|session)|sleep.?rem|paradoxal/i],
  ['leve', /light.?(sleep|min|session)|sleep.?light|core.?sleep|sommeil.?leger|sono.?leve/i],
  ['sono', /sleep.?(duration|hours|total)|total.?sleep|duration.?sleep|sono|temps.?de.?sommeil|^sleep$/i],
];

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

const RE_DATA = /^date$|^dia$|^data$|activity.?date|calendar|^day$|jour/i;

// Cabe numa coluna de estágio? (deep/light/core/rem/…)
const RE_ESTAGIO = /deep|light|core|\brem\b|profond|paradoxal|l.?eger|leve|despert|awake/i;

/** Analisador de CSV diário (Garmin Connect ou exportação genérica). */
function analisadorCSV(nomeFicheiro = '') {
  const dias = new Map();
  const campos = new Set();
  const avisos = [];
  let cab = null, sep = ',', lidas = 0, semData = 0;
  const ignoradas = [];

  const bucket = (chave) => {
    let d = dias.get(chave);
    if (!d) { d = novoDia(chave); dias.set(chave, d); }
    return d;
  };
  // i === 7 é o sono total: exclui os estágios, senão «Deep Sleep Duration»
  // ganhava e o sono profundo era importado como horas de sono.
  const coluna = (i) => (cab
    ? cab.find(c => COLUNAS[i][1].test(c) && (i !== 7 || !RE_ESTAGIO.test(c)))
    : undefined);

  return {
    alimentar(texto) {
      const partes = texto.split('\n');
      if (!cab) {
        // o Excel/Garmin escrevem BOM UTF-8: sem o remover, a coluna de data
        // chega como "\uFEFFDate" e deixa de ser reconhecida
        const primeira = (partes.shift() || '').replace(/^\uFEFF/, '');
        sep = detectarSeparador(primeira);
        cab = dividirLinha(primeira, sep);
        if (!cab.some(c => RE_DATA.test(c))) avisos.push('Não encontrámos uma coluna de data (Date / Dia / Activity Date).');
        cab.forEach(c => {
          if (!c) return;
          if (!RE_DATA.test(c) && !COLUNAS.some(([, re]) => re.test(c))) ignoradas.push(c);
        });
      }
      const colData = cab.find(c => RE_DATA.test(c));
      const pesos = coluna(0), passos = coluna(1), kcal = coluna(2), hrv = coluna(3);
      const prof = coluna(4), rem = coluna(5), leve = coluna(6), sono = coluna(7);
      for (const linha of partes) {
        if (!linha.trim()) continue;
        lidas++;
        const vals = dividirLinha(linha, sep);
        const a = {};
        cab.forEach((c, i) => { a[c] = vals[i]; });
        const d = parseDataHora(a[colData]);
        if (!d) { semData++; continue; }
        const b = bucket(ISO(d));
        if (pesos) {
          let kg = num(a[pesos]);
          if (kg != null && /\blbs?\b|pound|libra/i.test(pesos)) kg *= 0.45359237;
          if (kg != null && kg > 2 && kg < 400) {
            if (d.getTime() >= b.pesoTs) { b.pesoKg = kg; b.pesoTs = d.getTime(); }
            campos.add('peso');
          }
        }
        if (passos) { const v = num(a[passos]); if (v != null) { b.passos = Math.max(b.passos, Math.round(v)); b.temPassos = true; campos.add('passos'); } }
        if (kcal) { const v = num(a[kcal]); if (v != null) { b.kcalAtivas = Math.max(b.kcalAtivas, Math.round(v)); b.temEnergia = true; campos.add('calorias'); } }
        if (hrv) { const v = num(a[hrv]); if (v != null) { b.hrvMs = Math.round(v); campos.add('HRV'); } }
        const dp = prof ? minutos(a[prof], prof) : null;
        const dr = rem ? minutos(a[rem], rem) : null;
        const dl = leve ? minutos(a[leve], leve) : null;
        const total = sono ? minutos(a[sono], sono) : null;
        const soma = (dp || 0) + (dr || 0) + (dl || 0);
        if (soma >= 60) {
          b.temSono = true;
          b.sonoProfundoMin = Math.round(dp || 0);
          b.sonoREMmin = Math.round(dr || 0);
          b.sonoLeveMin = Math.round(dl || 0);
          b.sonoHorasMin = Math.round(total && total >= 60 ? total : soma);
          campos.add('sono');
        } else if (total != null && total >= 60 && total <= 1080) {
          b.temSono = true; b.sonoHorasMin = Math.round(total); campos.add('sono');
        }
      }
    },
    finalizar() {
      if (!cab) avisos.push('Ficheiro sem cabeçalho legível.');
      if (semData) avisos.push(`${semData} linha(s) sem data reconhecível foram ignoradas.`);
      return {
        formato: /garmin/i.test(nomeFicheiro) ? 'garmin' : 'csv',
        origem: /garmin/i.test(nomeFicheiro) ? 'garmin' : 'importado',
        dias, campos: [...campos], avisos, nome: nomeFicheiro || 'CSV',
        colunasIgnoradas: [...new Set(ignoradas)], linhas: lidas, ignorados: semData,
      };
    },
  };
}

const criadorPorNome = (nome, texto = '') =>
  /\.xml$/i.test(nome) || /<HealthData|<Record\b/.test(texto.slice(0, 4000)) ? analisadorApple() : analisadorCSV(nome);

/* ----------------------------------------------------- leitura atablhada -- */

/**
 * Lê um ficheiro em fragmentos, entregando texto que termina sempre em '>'
 * (XML) ou '\n' (CSV) — permite abrir export.xml de centenas de MB.
 */
async function lerFragmentos(file, tratar, { limite = '>', progresso } = {}) {
  const TAMANHO = 4 * 1024 * 1024;
  let pos = 0, resto = '';
  while (pos < file.size) {
    const fim = Math.min(pos + TAMANHO, file.size);
    const tudo = resto + await file.slice(pos, fim).text();
    const corte = tudo.lastIndexOf(limite);
    if (corte === -1) {
      if (tudo.length > 48 * 1024 * 1024) throw new Error('Não encontrámos limites legíveis neste ficheiro.');
      // sem delimitador neste fragmento, guarda-o para juntar ao seguinte
      // (antes era descartado e o registo que caísse na fronteira perdia-se)
      resto = tudo;
    } else {
      tratar(tudo.slice(0, corte + 1));
      resto = tudo.slice(corte + 1);
    }
    pos = fim;
    if (progresso) progresso(Math.min(1, pos / file.size));
  }
  if (resto) tratar(resto);
  if (progresso) progresso(1);
}

/** Analisa um File (XML/CSV) com barra de progresso opcional. */
export async function analisarFicheiro(file, { progresso } = {}) {
  const ehXml = /\.xml$/i.test(file.name) || /<Record\b/.test((await file.slice(0, 4000).text()));
  const analise = ehXml ? analisadorApple() : analisadorCSV(file.name);
  await lerFragmentos(file, (t) => analise.alimentar(t), {
    limite: ehXml ? '>' : '\n', progresso,
  });
  const r = analise.finalizar();
  r.ficheiro = file.name;
  r.tamanho = file.size;
  return r;
}

/** Analisa texto colado (XML ou CSV) sem gravar. */
export function analisarTexto(texto, nome = 'export.xml') {
  const analise = criadorPorNome(nome, texto);
  analise.alimentar(texto);
  return analise.finalizar();
}

/** Converte a análise em RegistoDiario. Devolve o nº de dias gravados. */
export async function aplicarAnalise(analise, { limiteDias = 400 } = {}) {
  const agora = Date.now();
  const corte = agora - limiteDias * 864e5;
  let gravados = 0;
  for (const d of analise.dias.values()) {
    const ms = new Date(d.chave + 'T12:00').getTime();
    if (Number.isNaN(ms) || ms > agora + 864e5 || ms < corte) continue;
    const patch = { __src: d.origem || analise.origem };
    if (d.pesoKg != null) patch.pesoKg = +d.pesoKg.toFixed(2);
    if (d.temPassos && d.passos > 0) patch.passos = Math.round(d.passos);
    if (d.temEnergia && d.kcalAtivas > 0) patch.kcalAtivas = Math.round(d.kcalAtivas);
    if (d.hrvMs != null) patch.hrvMs = Math.round(d.hrvMs);
    if (d.temSono && d.sonoHorasMin) {
      patch.sonoHoras = +(d.sonoHorasMin / 60).toFixed(2);
      if (d.sonoProfundoMin != null) patch.sonoProfundoMin = d.sonoProfundoMin;
      if (d.sonoREMmin != null) patch.sonoREMmin = d.sonoREMmin;
      if (d.sonoLeveMin != null) patch.sonoLeveMin = d.sonoLeveMin;
    }
    if (Object.keys(patch).length <= 1) continue;
    await patchDia(d.chave, patch);
    gravados++;
  }
  return gravados;
}

/** Caminho programático: `importarSaude(texto, nome)` analisa e grava. */
export async function importarSaude(texto, nome = 'dados.xml') {
  const r = analisarTexto(texto, nome);
  const dias = await aplicarAnalise(r);
  return Object.assign({}, r, { dias, nome: nome || r.nome });
}

/* ------------------------------------------------- pré-visualização ----- */

function resumo(analise) {
  const linhas = [];
  const add = (campo, ler) => {
    const selecionados = [...analise.dias.values()].filter(ler);
    if (!selecionados.length) return;
    const chaves = selecionados.map(d => d.chave).sort();
    linhas.push({ campo, n: chaves.length, de: chaves[0], ate: chaves.at(-1), exemplo: ler(selecionados.at(-1)) });
  };
  add('Peso', d => (d.pesoKg != null ? `${fmt(d.pesoKg, 1)} kg` : null));
  add('Passos', d => (d.temPassos && d.passos ? `${fmt(d.passos)} passos` : null));
  add('Calorias ativas', d => (d.temEnergia && d.kcalAtivas ? `${fmt(d.kcalAtivas)} kcal` : null));
  add('HRV', d => (d.hrvMs != null ? `${fmt(d.hrvMs)} ms` : null));
  add('Sono', d => (d.temSono && d.sonoHorasMin
    ? `${fmt(d.sonoHorasMin / 60, 1)} h${d.sonoProfundoMin ? ` · prof. ${fmt(d.sonoProfundoMin / 60, 1)} h` : ''}`
    : null));
  return linhas;
}

/* ------------------------------------------------------------ folha ----- */

export async function sheetImportar() {
  let acumulada = new Map();
  let meta = {};
  const lidos = [];                 // todos os ficheiros desta sessão da folha
  const ignoradas = new Set();      // colunas que não sabemos usar

  const corpo = el(`
    <div>
      <div class="note">
        <b>Por que é preciso exportar?</b> No iOS o HealthKit só é legível por apps nativas —
        uma web app não recebe essa autorização. O percurso oficial é exportar do Apple Saúde
        (ou do Garmin Connect) e importar aqui. <b>Tudo fica neste dispositivo.</b>
      </div>

      <div class="section-title mt20">1 · Apple Saúde (no iPhone)</div>
      <ol class="steps">
        <li>Abra a app <b>Saúde</b> → toque no seu nome, no topo.</li>
        <li><b>Dados e dispositivos</b> → <b>Exportar todos os dados</b> → <i>Transferir para o iPhone</i>.</li>
        <li>Aguarde a preparação e guarde o <b>Archive.zip</b> na app <b>Ficheiros</b>.</li>
        <li>Toque no zip para o descomprimir e escolha o <b>export.xml</b> aqui em baixo.</li>
      </ol>

      <div class="section-title mt20">2 · Garmin Connect</div>
      <ol class="steps">
        <li>No computador, em <b>connect.garmin.com</b>: <b>Saúde</b> → <b>Passos</b>, <b>Peso</b> ou <b>Sono</b>.</li>
        <li>Cada gráfico tem o menu <b>⋯</b> → <b>Exportar .csv</b>.</li>
        <li>Importe vários ficheiros em simultâneo — os campos juntam-se por dia.</li>
      </ol>

      <div class="section-title mt20">Ficheiros</div>
      <input type="file" accept=".xml,.csv,.txt,.tsv" multiple data-ficheiro style="display:none">
      <div class="btn-row">
        <button class="btn btn-primary" data-escolher>${ICON.upload} Escolher ficheiros</button>
        <button class="btn btn-ghost" data-colar>Colar conteúdo</button>
      </div>
      <div data-estado class="mt12"></div>
      <div data-previa hidden></div>
    </div>`);

  const estado = corpo.querySelector('[data-estado]');
  const previa = corpo.querySelector('[data-previa]');
  const input = corpo.querySelector('[data-ficheiro]');

  function desenharPrevia() {
    const linhas = resumo({ dias: acumulada });
    previa.hidden = !linhas.length;
    if (!linhas.length) return;
    previa.innerHTML = `
      <div class="section-title mt20">O que encontrámos</div>
      <div class="card card-tight">
        <div class="metric-label">${esc(meta.nome || 'importação')}</div>
        <div class="list mt8">
          ${linhas.map(l => `<div class="row">
            <div class="row-main"><div class="row-title">${esc(l.campo)}</div>
              <div class="row-sub">${dataLonga(l.de)} → ${dataLonga(l.ate)} · ${l.n} dia${l.n > 1 ? 's' : ''}</div></div>
            <div class="row-end">${esc(l.exemplo)}</div></div>`).join('')}
        </div>
      </div>
      ${(meta.avisos || []).map(a => `<p class="hint mt12" style="color:var(--amber)">${esc(a)}</p>`).join('')}
      ${meta.colunasIgnoradas && meta.colunasIgnoradas.length
        ? `<p class="hint mt12">Colunas não usadas: ${esc(meta.colunasIgnoradas.slice(0, 10).join(', '))}</p>` : ''}
      <p class="hint mt12">O sono é atribuído <b>ao dia em que acordou</b>. Datas fora dos últimos 400 dias são ignoradas.</p>`;
    gravar.disabled = !acumulada.size;
  }

  async function processar(ficheiros) {
    const lista = [...ficheiros].filter(f => /\.(xml|csv|tsv|txt)$/i.test(f.name));
    if (!lista.length) { toast('Escolha um export.xml ou um .csv', 'err'); return; }
    const avisos = [];
    for (const f of lista) {
      estado.innerHTML = `<div class="card card-tight">
        <div class="metric-label">a ler <b>${esc(f.name)}</b> · ${fmt(f.size / 1e6, 1)} MB</div>
        <div class="bar mt8"><i data-fill style="width:0%"></i></div></div>`;
      const fill = estado.querySelector('[data-fill]');
      try {
        const r = await analisarFicheiro(f, { progresso: (p) => { if (fill) fill.style.width = `${Math.round(p * 100)}%`; } });
        if (!r.dias.size) { avisos.push(`${f.name}: nada reconhecido.`); continue; }
        lidos.push(f.name);
        (r.colunasIgnoradas || []).forEach(c => ignoradas.add(c));
        meta = {
          nome: lidos.length > 1 ? lidos.length + ' ficheiros' : (r.ficheiro || r.nome),
          formato: r.formato, origem: r.origem, avisos,
          colunasIgnoradas: [...ignoradas],
        };
        r.avisos.forEach(a => avisos.push(a));
        for (const [k, d] of r.dias) { d.origem = r.origem; combin(acumulada, k, d); }
      } catch (e) {
        estado.innerHTML = `<p class="hint" style="color:var(--red)">${esc(e.message || 'Falha ao ler o ficheiro.')}</p>`;
        return;
      }
    }
    estado.innerHTML = acumulada.size
      ? `<p class="hint">${acumulada.size} dias prontos a gravar — nada é enviado para a Internet.</p>`
      : `<p class="hint" style="color:var(--amber)">Nenhum campo reconhecido. Verifique se descomprimiu o Archive.zip.</p>`;
    desenharPrevia();
  }

  const combin = (mapa, chave, novo) => {
    const base = mapa.get(chave) || novoDia(chave);
    mapa.set(chave, combinar(base, novo));
  };

  corpo.querySelector('[data-escolher]').onclick = () => input.click();
  // sem limpar o value, escolher o mesmo ficheiro duas vezes não dispara onchange
  input.onchange = async () => { const f = [...input.files]; input.value = ''; await processar(f); };

  corpo.querySelector('[data-colar]').onclick = async () => {
    const texto = prompt('Cole aqui o conteúdo do export.xml ou do CSV (ficheiros pequenos):');
    if (!texto || texto.length < 20) return;
    try {
      const r = analisarTexto(texto, /<Record|<HealthData/.test(texto) ? 'export.xml' : 'dados.csv');
      if (!r.dias.size) { toast('Nada reconhecido nesse texto', 'err'); return; }
      for (const [k, d] of r.dias) { d.origem = r.origem; combin(acumulada, k, d); }
      lidos.push('texto colado');
      (r.colunasIgnoradas || []).forEach(c => ignoradas.add(c));
      meta = {
        nome: lidos.length > 1 ? lidos.length + ' fontes' : r.nome,
        formato: r.formato, origem: r.origem, avisos: r.avisos, colunasIgnoradas: [...ignoradas],
      };
      estado.innerHTML = `<p class="hint">${r.dias.size} dias a partir do texto colado.</p>`;
      desenharPrevia();
    } catch (e) { toast(e.message || 'Texto inválido', 'err'); }
  };

  const { fechar } = sheet({
    titulo: 'Importar dados reais', sub: 'Apple Saúde · Garmin Connect · CSV', corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Fechar</button>
            <button class="btn btn-primary" data-gravar disabled>Gravar no diário</button>`,
  });

  const gravar = corpo.closest('.sheet').querySelector('[data-gravar]');
  gravar.onclick = async () => {
    if (!acumulada.size) return;
    gravar.disabled = true;
    try {
      const n = await aplicarAnalise({ dias: acumulada, origem: meta.origem || 'importado' });
      haptic([10, 40, 10]);
      toast(`${n} dias importados`);
      fechar();
      const { refresh } = await import('./nav.js');
      refresh();
    } catch (e) {
      // sem isto o botão ficava desativado e o erro não chegava ao utilizador
      toast(e.message || 'Falha ao gravar a importação', 'err', 6000);
      gravar.disabled = false;
    }
  };

  return fechar;
}
