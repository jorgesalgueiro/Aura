/* ==========================================================================
   seed.js — dados de exemplo para a app não abrir vazia
   --------------------------------------------------------------------------
   Gera ~45 dias coerentes com o Ecrã 6 do plano: as crises seguem as bandas
   de pressão atmosférica (1013 → sem crises · 1005 → ligeira · 995 → severa
   · 1020 → sem crises). Se já houver clima real carregado, são usadas as
   médias diárias verdadeiras; senão é gerada uma onda plausível. Além do
   clima há uma pequena probabilidade diária de crise por outros gatilhos
   (stress, sono, desidratação) — uma pessoa com enxaqueca tem-nas mesmo
   quando o tempo está estável, e sem isso um outono de pressão alta deixava
   os relatórios quase vazios.

   Nunca apaga nem escreve por cima de registos manuais: os campos já
   preenchidos de um dia mantêm-se, um dia com crise existente não recebe
   outra, e correr outra vez limpa primeiro o lote de exemplo anterior.
   ========================================================================== */

import {
  uid, dayKey, isoOf, hhmm, get, put, del, all, getDia, patchDia, dias, settings,
} from './store.js';
import { clima, pressaoMediaDiaria } from './clima.js';

/** Gerador determinístico — a mesma sequência em cada execução. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ESCOLHER = (r, lista, n = 1) => {
  const copia = lista.slice();
  const out = [];
  while (out.length < n && copia.length) out.push(copia.splice(Math.floor(r() * copia.length), 1)[0]);
  return out;
};

const ARRED = (v, dec = 0) => {
  const f = 10 ** dec;
  return Math.round(v * f) / f;
};

/* ------------------------------------------------- pressão horária ------- */

/**
 * Pressão hora a hora já medida para esta localidade, agrupada por dia local.
 * @returns {Map<string, (number|null)[]>} chave AAAA-MM-DD → 24 leituras (null = falta)
 */
function pressaoRealPorDia() {
  const porDia = new Map();
  for (const p of clima.serie || []) {
    if (!p || p.hpa == null) continue;
    const texto = String(p.t);
    const chave = texto.slice(0, 10);
    const hora = Number(texto.slice(11, 13));
    if (!(hora >= 0 && hora < 24)) continue;
    if (!porDia.has(chave)) porDia.set(chave, new Array(24).fill(null));
    porDia.get(chave)[hora] = p.hpa;
  }
  return porDia;
}

/** Preenche horas em falta com a leitura medida mais próxima do mesmo dia. */
function fecharLacunas(horas) {
  const sabe = horas.findIndex(v => v != null);
  if (sabe < 0) return null;
  return horas.map((v, h) => {
    if (v != null) return v;
    for (let d = 1; d < 12; d++) {
      if (horas[h - d] != null) return horas[h - d];
      if (horas[h + d] != null) return horas[h + d];
    }
    return horas[sabe];
  });
}

/**
 * Série horária de pressão para a janela pedida.
 * Preferência: Open-Meteo medido, hora a hora; recurso: onda sintética
 * deslocada para a média real do dia.
 * @returns {Map<string, number[]>} chave AAAA-MM-DD → 24 leituras
 */
function pressaoPorDia(nDias, r) {
  const porDia = new Map();
  const medidas = pressaoRealPorDia();
  const medias = pressaoMediaDiaria();
  const fase = r() * Math.PI * 2;
  const amplitude = 9 + r() * 5;

  for (let i = nDias - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const chave = dayKey(d);

    const real = fecharLacunas(medidas.get(chave) || []);
    if (real) {                                        // dias medidos: vale o que se passou
      porDia.set(chave, real.map(v => ARRED(v, 1)));
      continue;
    }

    const horas = [];
    for (let h = 0; h < 24; h++) {
      const t = (nDias - i) * 24 + h;
      // sintética: ciclo de ~2,5 dias entre 995 e 1022 hPa + oscilação de frente
      const onda = 1008 + amplitude * Math.sin(t / 30 + fase) + 4.5 * Math.sin(t / 7 + fase * 3);
      horas.push(ARRED(onda + (r() - 0.5) * 1.6, 1));
    }
    const mediaReal = medias[chave];
    if (mediaReal != null) {                           // pelo menos a média é verdadeira
      const desvio = mediaReal - mediaDe(horas);
      for (let h = 0; h < 24; h++) horas[h] = ARRED(horas[h] + desvio, 1);
    }
    porDia.set(chave, horas);
  }
  return porDia;
}

const mediaDe = (a) => a.reduce((s, v) => s + v, 0) / a.length;

/** Leitura interpolada à hora pedida e variação nas 6 h anteriores. */
function estadoHora(horas, horaDia, horaAnterior) {
  const p = horas[Math.max(0, Math.min(23, Math.round(horaDia)))];
  const q = horas[Math.max(0, Math.min(23, Math.round(horaAnterior)))];
  return { p, delta: ARRED(p - q, 1) };
}

/* ------------------------------------------------- intensidade modelo ---- */

/** Componente atmosférica — as bandas do Ecrã 6 do plano. */
function intensidadePelaPressao(media, delta) {
  let base = 0;
  if (media < 1000) base = 7.6;            // queda acentuada → severa
  else if (media < 1008) base = 3.6;       // queda ligeira → ligeira/moderada
  else if (media < 1016) base = 1.1;       // normal → rara
  else base = 0.35;                        // alta → muito rara
  if (delta <= -4) base += 2.2;
  else if (delta <= -2) base += 1.1;
  else if (delta <= -1) base += 0.4;
  return base;
}

/**
 * Componente não atmosférica. Uma pessoa com enxaqueca episódica tem crises
 * por stress, sono ou desidratação mesmo com o tempo estável — sem isto, uma
 * semana de pressão alta no outono deixaria o diário e os relatórios vazios.
 * @returns {number} intensidade alvo (0 na maioria dos dias)
 */
function intensidadePorOutrosGatilhos(r) {
  if (r() > 0.10) return 0;                 // ~1 crise destes origem em 10 dias
  return 4.2 + r() * 3.2;                   // 4,2 – 7,4
}

/* ------------------------------------------------------------ semear ----- */

const ITENS_FARMACIA = [
  { nome: 'Sumatriptano', dosagem: '50 mg', categoria: 'medicamento', tomarAs: [], sos: true },
  { nome: 'Ibuprofeno', dosagem: '400 mg', categoria: 'medicamento', tomarAs: [], sos: true },
  { nome: 'Magnésio', dosagem: '300 mg', categoria: 'suplemento', tomarAs: ['09:00', '21:00'] },
  { nome: 'Vitamina D3', dosagem: '2000 UI', categoria: 'suplemento', tomarAs: ['09:00'] },
  { nome: 'Coenzima Q10', dosagem: '100 mg', categoria: 'suplemento', tomarAs: ['09:00'] },
  { nome: 'Losartan', dosagem: '50 mg', categoria: 'medicamento', tomarAs: ['08:00'] },
];

const REFEICOES = [
  ['Iogurte grego com aveia e mirtilos', 320], ['Café com leite de aveia', 110],
  ['Sopa de legumes + peixe grelhado', 520], ['Salada de grão com atum', 460],
  ['Arroz de frango e brócolos', 610], ['Omelete de espinafres', 380],
  ['Massa com tomate e manjericão', 540], ['Salmão com batata-doce', 620],
  ['Sandes de peru e queijo', 350], ['Fruta e um punhado de nozes', 240],
];

/**
 * Apaga o lote de exemplo anterior para que o botão "Carregar dados de
 * exemplo" possa ser usado mais do que uma vez sem duplicar registos.
 * Nos diários só limpa os campos cuja origem é 'exemplo' — dados manuais
 * ou importados ficam sempre intactos.
 */
async function limparSementeAnterior() {
  const info = await get('meta', 'seedInfo');
  if (!info || !info.v) return 0;
  const { ids = {}, chaves = [] } = info.v;
  let apagados = 0;
  for (const loja of ['registoEnxaqueca', 'registoFezes', 'tomaMedicacao', 'refeicao']) {
    for (const id of ids[loja] || []) { await del(loja, id); apagados++; }
  }
  for (const chave of chaves) {
    const dia = await get('registoDiario', chave);
    if (!dia) continue;
    const deExemplo = Object.keys(dia.origem || {}).filter(k => dia.origem[k] === 'exemplo');
    if (!deExemplo.length) continue;
    for (const campo of deExemplo) {
      dia[campo] = Array.isArray(dia[campo]) ? [] : (campo === 'aguaMl' ? 0 : null);
      delete dia.origem[campo];
    }
    dia.atualizado = isoOf();
    await put('registoDiario', dia);
    apagados++;
  }
  await del('meta', 'seedInfo');
  return apagados;
}

/**
 * Cria o histórico de exemplo.
 * @param {{dias?:number}} opts
 * @returns {Promise<number>} número de registos escritos
 */
export async function semeExemplos({ dias: nDias = 45 } = {}) {
  let n = 0;
  const r = rng(20261011);
  const s = await settings();
  const chaves = dias(nDias);
  const pressao = pressaoPorDia(nDias, r);
  await limparSementeAnterior();
  const novos = { registoEnxaqueca: [], registoFezes: [], tomaMedicacao: [], refeicao: [] };
  const salvar = async (loja, reg) => { await put(loja, reg); novos[loja].push(reg.id); n++; return reg; };

  /* 1 · base de medicação --------------------------------------------- */
  const itensExistentes = await get('meta', 'seedFarmacia').catch(() => null);
  const farmaciaIds = [];
  if (!itensExistentes) {
    for (const modelo of ITENS_FARMACIA) {
      const item = {
        id: uid(), nome: modelo.nome, dosagem: modelo.dosagem,
        categoria: modelo.categoria, tomarAs: modelo.tomarAs.slice(), ativo: true,
      };
      await put('itemMedicacao', item);
      farmaciaIds.push({ id: item.id, ...modelo });
      n++;
    }
    await put('meta', { k: 'seedFarmacia', v: { em: isoOf(), ids: farmaciaIds.map(f => f.id) } });
  } else {
    for (const id of itensExistentes.v.ids || []) {
      const it = await get('itemMedicacao', id);
      if (it) farmaciaIds.push({ id, nome: it.nome, dosagem: it.dosagem, categoria: it.categoria, tomarAs: it.tomarAs || [] });
    }
  }

  /* 2 · dias, crises, sono, água, tomas ------------------------------- */
  let peso = 71 + r() * 4;
  const agora = Date.now();
  const diasComCrise = new Set((await all('registoEnxaqueca')).map(c => c.data));

  for (let i = 0; i < chaves.length; i++) {
    const chave = chaves[i];
    const horas = pressao.get(chave);
    const media = mediaDe(horas);
    const ehHoje = i === chaves.length - 1;

    peso += (r() - 0.5) * 0.28;

    /* — crise prevista para este dia? (nunca por cima de uma já registada) — */
    const tendencia = ARRED(mediaDe(horas.slice(0, 12)) - mediaDe(horas.slice(12)), 1);
    const doClima = intensidadePelaPressao(media, tendencia);
    const doResto = intensidadePorOutrosGatilhos(r);
    const expectativa = Math.max(doClima, doResto);
    const probabilidade = Math.min(0.92, Math.max(0, expectativa / 10));
    const vaiCrise = !diasComCrise.has(chave) && expectativa >= 1 && r() < probabilidade;

    let crise = null;
    if (vaiCrise) {
      const horaInicio = 8 + Math.floor(r() * 13);                 // 08:00 – 20:00
      const { p: pressaoInicio, delta } = estadoHora(horas, horaInicio, horaInicio - 6);
      const intensidade = Math.max(1, Math.min(10, Math.round(expectativa + (r() - 0.4) * 1.6)));
      const duracaoH = 2.5 + intensidade * 0.55 + r() * 2;
      const inicio = new Date(chave + 'T00:00');
      inicio.setHours(horaInicio, Math.floor(r() * 6) * 10, 0, 0);
      const fim = new Date(Math.min(agora, +inicio + duracaoH * 3600e3));
      if (+inicio < agora - 30 * 60e3) {                            // nunca deixa uma crise "ativa"
        const gatilhos = [];
        if (delta <= -1.5) gatilhos.push('Queda de pressão');
        if (media < 1008) gatilhos.push('Frio');
        gatilhos.push(...ESCOLHER(r, ['Stress', 'Pouco sono', 'Luz forte', 'Cafeína', 'Desidratação', 'Jejum'], 1 + Math.floor(r() * 2)));
        const zonasPorIntensidade = intensidade >= 7
          ? ['lateral_esq', 'occipital', 'ocular', 'frontal']
          : ['frontal', 'ocular', 'lateral_dir', 'lateral_esq'];
        crise = {
          id: uid(),
          dataInicio: isoOf(inicio), data: chave, dataFim: isoOf(fim),
          zonas: ESCOLHER(r, zonasPorIntensidade, intensidade >= 7 ? 3 : 2),
          intensidade,
          gatilhos: [...new Set(gatilhos)],
          notas: intensidade >= 7 ? 'Aura visual de ~25 min antes da dor. Fica no escuro.' : 'Dor suportável, passou com medicação.',
          tomaMedicacaoIds: [],
          pressaoInicioHpa: pressaoInicio,
          deltaPressao6hHpa: delta,
          tempoAntesMin: Math.round((fim - inicio) / 6e4),
        };
        await salvar('registoEnxaqueca', crise);

        // SOS na hora seguinte ao início
        const sos = farmaciaIds.find(f => f.sos) || farmaciaIds[0];
        if (sos) {
          const quando = new Date(+inicio + (25 + r() * 35) * 60e3);
          if (+quando < agora) {
            await salvar('tomaMedicacao', { id: uid(), itemId: sos.id, data: chave, hora: hhmm(quando), quando: isoOf(quando) });
            crise.tomaMedicacaoIds.push(sos.id);
            await put('registoEnxaqueca', crise);            // atualiza, não conta duas vezes
          }
        }
      } else {
        crise = null;
      }
    }

    /* — RegistoDiario (sem por cima de dados manuais) — */
    const atual = await getDia(chave);
    const sonoHoras = ARRED(6.1 + r() * 2.4 - (crise ? 0.9 : 0), 1);
    const totalFases = Math.round(sonoHoras * 60);
    const profundo = Math.round(totalFases * (0.15 + r() * 0.07));
    const rem = Math.round(totalFases * (0.19 + r() * 0.06));
    const patch = { __src: 'exemplo' };
    if (atual.pesoKg == null) patch.pesoKg = ARRED(peso, 1);
    if (!atual.aguaMl) patch.aguaMl = (ehHoje ? 6 : 7 + Math.floor(r() * 3)) * s.incrementoAguaMl;
    if (atual.tempC == null) patch.tempC = ARRED(36.2 + r() * 0.5, 1);
    if (atual.pressaoHpa == null) patch.pressaoHpa = ARRED(media, 1);
    if (atual.sonoHoras == null) {
      patch.sonoHoras = sonoHoras;
      patch.sonoProfundoMin = profundo;
      patch.sonoREMmin = rem;
      patch.sonoLeveMin = Math.max(0, totalFases - profundo - rem);
    }
    if (atual.hrvMs == null) patch.hrvMs = Math.round(46 + r() * 26 - (crise ? 14 : 0));
    if (atual.passos == null) patch.passos = Math.round(4200 + r() * 6200 - (crise ? 3400 : 0));
    if (atual.kcalAtivas == null) patch.kcalAtivas = Math.round(220 + r() * 330 - (crise ? 130 : 0));
    if (atual.energia == null) patch.energia = Math.max(1, Math.min(10, Math.round(7.6 - (crise ? 3.2 : 0) + (r() - 0.5) * 2)));
    if (atual.stress == null) patch.stress = Math.max(1, Math.min(10, Math.round(3.6 + (crise ? 2.8 : 0) + (r() - 0.5) * 2.6)));
    if (!atual.notas && crise) patch.notas = crise.intensidade >= 7 ? 'Dia perdido para a enxaqueca.' : 'Manhã pesada, melhorou depois do almoço.';
    if (!atual.doencas?.length && r() < 0.07) patch.doencas = ESCOLHER(r, ['Cansaço Extremo', 'Dores de Costas', 'Náuseas', 'Insónia'], 1);
    if (!atual.afrontamentos?.length && r() < (crise ? 0.28 : 0.1)) {
      const nAfront = r() < 0.25 ? 2 : 1;
      const listaAfront = Array.from({ length: nAfront }, () => {
        const hora = 9 + Math.floor(r() * 11);
        const quando = new Date(chave + 'T00:00');
        quando.setHours(hora, Math.floor(r() * 6) * 10, 0, 0);
        return {
          id: uid(), hora: hhmm(quando), quando: isoOf(quando),
          intensidade: Math.max(1, Math.min(10, Math.round(3 + r() * 5))),
          notas: '',
        };
      }).filter(a => +new Date(a.quando) <= agora);
      if (listaAfront.length) patch.afrontamentos = listaAfront;
    }
    await patchDia(chave, patch); n++;

    /* — tomas programadas dos suplementos/medicação crónica — */
    for (const f of farmaciaIds) {
      for (const hora of f.tomarAs || []) {
        if (r() < 0.14) continue;                                  // ~86 % de aderência
        const quando = new Date(chave + 'T' + hora + ':00');
        if (+quando > agora) continue;
        await salvar('tomaMedicacao', {
          id: uid(), itemId: f.id, data: chave, hora,
          quando: isoOf(new Date(+quando + Math.round((r() - 0.5) * 40) * 60e3)),
        });
      }
    }

    /* — escala de Bristol — */
    if (r() < 0.78) {
      const tipoBase = crise ? (r() < 0.45 ? 6 : 5) : (r() < 0.62 ? 4 : 3);
      await salvar('registoFezes', {
        id: uid(),
        hora: isoOf(new Date(chave + 'T08:1' + Math.floor(r() * 9) + ':00')),
        data: chave, tipo: tipoBase,
        hemorroides: tipoBase >= 6 && r() < 0.4
          ? { desconforto: 3 + Math.floor(r() * 4), sangramento: r() < 0.35, fatores: ESCOLHER(r, ['Esforço', 'Ficar muito sentado', 'Pouca fibra', 'Desidratação'], 2) }
          : null,
      });
    }

    /* — refeições (só as últimas 3 semanas, para não inflar a base) — */
    if (i >= chaves.length - 21) {
      for (const hora of ['08:15', '13:00', '20:00'].slice(0, 2 + (r() < 0.6 ? 1 : 0))) {
        const [txt, kcal] = REFEICOES[Math.floor(r() * REFEICOES.length)];
        const quando = new Date(chave + 'T' + hora + ':00');
        if (+quando > agora) continue;
        await salvar('refeicao', {
          id: uid(), quando: isoOf(quando), data: chave, hora,
          texto: txt, calorias: Math.round(kcal * (0.85 + r() * 0.3)), fotos: [],
        });
      }
    }
  }

  await put('meta', {
    k: 'seedInfo',
    v: { em: isoOf(), dias: nDias, registos: n, chaves, ids: novos },
  });
  return n;
}
