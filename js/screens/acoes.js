/* ==========================================================================
   screens/acoes.js — folhas de registo rápido partilhadas por vários ecrãs
   ========================================================================== */

import {
  getDia, patchDia, diaKey, hhmm, uid, iniciarCrise, terminarCrise, updateCrise, criseAtiva,
  farmacia, salvarItem, toggleToma, tomasDoDia, adicionarFezes, adicionarRefeicao, adicionarAfrontamento,
  ZONAS_CABECA, GATILHOS, BRISTOL, settings,
} from '../store.js';
import { el, esc, sheet, toast, haptic, ICON, bristolSVG, headMapSVG, on, fmt, dataLonga } from '../utils.js';
import { anel, corIntensidade } from '../charts.js';
import { seriePressao, pressaoEm } from '../weather.js';
import { refresh } from '../nav.js';

/* ------------------------------------------------------------- água ----- */

export async function sheetAgua(data = diaKey()) {
  const s = await settings();
  const dia = await getDia(data);
  const passo = s.incrementoAguaMl;

  const corpo = el(`
    <div class="center">
      <div class="ring" style="margin:6px auto 14px">${anel({ valor: dia.aguaMl, total: s.objetivoAguaMl, tamanho: 148, espessura: 13 })}
        <div class="ring-txt"><b>${fmt(dia.aguaMl)} ml</b><small>objetivo ${fmt(s.objetivoAguaMl)} ml</small></div></div>
      <div class="grid3">
        <button class="btn" data-add="${passo}">+ ${passo} ml</button>
        <button class="btn" data-add="${passo * 2}">+ ${passo * 2} ml</button>
        <button class="btn" data-add="500">+ 500 ml</button>
      </div>
      <div class="btn-row mt12">
        <button class="btn btn-ghost" data-add="-${passo}">− ${passo} ml</button>
        <button class="btn btn-ghost" data-custom="1">Quantidade à medida</button>
      </div>
      <p class="hint mt16" style="margin-top:18px">Cada copo conta como ${passo} ml. O incremento define-se em Definições.</p>
      <div class="chips" style="justify-content:center" data-copos></div>
    </div>`);

  const atualizarAnel = async () => {
    const d = await getDia(data);
    const pct = Math.min(1, d.aguaMl / s.objetivoAguaMl);
    corpo.querySelector('.ring').innerHTML =
      anel({ valor: d.aguaMl, total: s.objetivoAguaMl, tamanho: 148, espessura: 13 }) +
      `<div class="ring-txt"><b>${fmt(d.aguaMl)} ml</b><small>objetivo ${fmt(s.objetivoAguaMl)} ml</small></div>`;
    corpo.querySelector('[data-copos]').innerHTML =
      Array.from({ length: Math.min(16, Math.floor(d.aguaMl / passo)) }, () =>
        `<span style="color:#38bdf8;font-size:17px" title="copo de ${passo} ml">▮</span>`).join('');
    return pct;
  };
  await atualizarAnel();

  const { fechar } = sheet({ titulo: 'Hidratação', sub: data === diaKey() ? 'Hoje' : data, corpo });

  on(corpo, 'click', '[data-add]', async (e, b) => {
    const delta = +b.dataset.add;
    const d = await getDia(data);
    await patchDia(data, { aguaMl: Math.max(0, d.aguaMl + delta) });
    haptic(delta > 0 ? 10 : 5);
    await atualizarAnel();
    refresh();
  });

  on(corpo, 'click', '[data-custom]', async () => {
    const v = prompt('Quantidade em ml:', '330');
    const ml = parseInt(v, 10);
    if (!ml || ml <= 0) return;
    const d = await getDia(data);
    await patchDia(data, { aguaMl: d.aguaMl + ml });
    await atualizarAnel();
    refresh();
    toast(`+ ${ml} ml registados`);
  });

  return fechar;
}

/* --------------------------------------------------------- medicação ---- */

export async function sheetTomas(data = diaKey()) {
  const itens = (await farmacia()).filter(i => i.ativo !== false);
  let tomas = await tomasDoDia(data);

  if (!itens.length) {
    sheet({
      titulo: 'Farmácia Pessoal',
      corpo: `<div class="empty"><strong>Ainda não tem medicamentos</strong>
        Crie a sua base de dados para marcar as tomadas com um toque.</div>`,
      acoes: `<button class="btn btn-primary" data-fechar>Fechar</button>`,
    });
    return;
  }

  const linha = (it) => {
    const horas = (it.tomarAs && it.tomarAs.length) ? it.tomarAs : ['—'];
    return `<div class="card card-tight" style="margin-bottom:10px">
      <div class="split">
        <div class="row-main">
          <div class="row-title">${esc(it.nome)}</div>
          <div class="row-sub">${esc(it.dosagem || '')}${it.categoria === 'suplemento' ? ' · suplemento' : ''}</div>
        </div>
        <button class="cbox" data-agora="${it.id}" aria-checked="${tomas.some(t => t.itemId === it.id)}" role="checkbox"
          aria-label="Marcar toma de ${esc(it.nome)} agora">${ICON.check}</button>
      </div>
      <div class="chips mt8" style="gap:6px">
        ${horas.map(h => h === '—' ? '' : `<button class="chip${tomas.some(t => t.itemId === it.id && t.hora === h) ? ' on' : ''}"
            data-slot="${it.id}|${h}" aria-pressed="${tomas.some(t => t.itemId === it.id && t.hora === h)}">${h}</button>`).join('')}
      </div>
    </div>`;
  };

  const corpo = el(`<div>${itens.map(linha).join('')}
    <p class="hint">Um toque marca a toma com a hora exata — é esta associação que alimenta o relatório de correlação.</p></div>`);

  const { fechar } = sheet({ titulo: 'Tomar medicação', sub: data === diaKey() ? 'Hoje' : data, corpo });

  const redesenhar = async () => {
    tomas = await tomasDoDia(data);
    corpo.innerHTML = itens.map(linha).join('');
  };

  on(corpo, 'click', '[data-agora]', async (e, b) => {
    const r = await toggleToma(b.dataset.agora, new Date());
    haptic(r.tomado ? 14 : 5);
    if (r.tomado) toast(`Registado às ${hhmm(new Date())}`);
    await redesenhar(); refresh();
  });

  on(corpo, 'click', '[data-slot]', async (e, b) => {
    const [itemId, hora] = b.dataset.slot.split('|');
    const [h, mi] = hora.split(':').map(Number);
    const d = new Date(data + 'T00:00'); d.setHours(h, mi, 0, 0);
    const r = await toggleToma(itemId, d);
    haptic(r.tomado ? 14 : 5);
    await redesenhar(); refresh();
  });

  return fechar;
}

/* ---------------------------------------------------------- enxaqueca --- */

async function capturarPressao(quando = new Date()) {
  try {
    const s = await settings();
    const { serie } = await seriePressao({ lat: s.lat, lon: s.lon, diasAtras: 5 });
    return pressaoEm(serie, quando.toISOString(), 6);
  } catch { return { hpa: null, delta: null }; }
}

export function intensidadeLabel(v) {
  return v <= 2 ? 'Ligeira' : v <= 5 ? 'Moderada' : v <= 8 ? 'Severa' : 'Muito severa';
}

/**
 * Folha de crise: mapa da cabeça, intensidade 1–10, gatilhos e medicação SOS.
 * @param {object|null} crise  crise existente (edição) ou null (nova)
 */
export async function sheetCrise(crise = null) {
  // Uma crise aberta na lista (mesmo já terminada) é editada, não recriada.
  // Sem crise explícita, retoma a crise em curso; só começa uma nova se não houver.
  const existente = crise || await criseAtiva();
  const aEditar = existente || null;
  const emCurso = !!aEditar && !aEditar.dataFim;
  const itens = await farmacia();
  const pressao = aEditar ? null : await capturarPressao();

  const estado = {
    zonas: aEditar ? [...(aEditar.zonas || [])] : [],
    intensidade: aEditar ? aEditar.intensidade : 5,
    gatilhos: aEditar ? [...(aEditar.gatilhos || [])] : [],
    sos: aEditar ? [...(aEditar.tomaMedicacaoIds || [])] : [],
  };
  // Só os SOS acrescentados nesta edição geram uma toma agora. Reabrir a folha
  // de uma crise em curso não pode voltar a registar a mesma medicação.
  const sosIniciais = new Set(estado.sos);

  const corpo = el(`
    <div>
      ${aEditar
        ? `<div class="note" style="margin-bottom:14px">
            <b>${emCurso ? 'Crise em curso' : 'Crise terminada'}</b><br>
            <span class="muted">${esc(dataLonga(aEditar.data))} · começou às ${hhmm(new Date(aEditar.dataInicio))}
            ${aEditar.dataFim ? ' · terminou às ' + hhmm(new Date(aEditar.dataFim)) : ''}
            ${aEditar.deltaPressao6hHpa != null ? ` · Δ6 h ${aEditar.deltaPressao6hHpa > 0 ? '+' : ''}${fmt(aEditar.deltaPressao6hHpa, 1)} hPa` : ''}</span></div>`
        : `<div class="note" style="margin-bottom:14px">
            <b>Leitura automática do clima</b><br>
            <span id="px" class="muted">a consultar ${esc((await settings()).localidade)}…</span></div>`}

      <div class="section-title" style="margin-top:4px">Zona afetada</div>
      <div class="headmap">${headMapSVG(estado.zonas)}</div>
      <div class="chips mt12" data-zonas>
        ${ZONAS_CABECA.map(z => `<button class="chip" data-zona="${z.id}" aria-pressed="${estado.zonas.includes(z.id)}">${z.nome}</button>`).join('')}
      </div>

      <div class="section-title mt20">Intensidade</div>
      <div class="card">
        <div class="slider-top">
          <span class="slider-name">${ICON.cabeca} <span data-lbl>${estado.intensidade} · ${intensidadeLabel(estado.intensidade)}</span></span>
          <span class="slider-read" data-val style="color:${corIntensidade(estado.intensidade)}">${estado.intensidade}</span>
        </div>
        <input type="range" min="1" max="10" step="1" value="${estado.intensidade}" data-int
          style="--fill:${corIntensidade(estado.intensidade)}">
        <div class="slider-scale"><span>1 · quase impercetível</span><span>10 · insuportável</span></div>
      </div>

      <div class="section-title mt20">Gatilhos</div>
      <div class="chips" data-gat>
        ${GATILHOS.map(g => `<button class="chip" data-gat-il="${esc(g)}" aria-pressed="${estado.gatilhos.includes(g)}">${esc(g)}</button>`).join('')}
      </div>

      ${itens.length ? `<div class="section-title mt20">Medicação SOS</div>
        <div class="list" data-sos>
          ${itens.map(i => `<div class="row">
            <div class="row-main"><div class="row-title">${esc(i.nome)}</div>
              <div class="row-sub">${esc(i.dosagem || '')}</div></div>
            <button class="cbox" data-sos-id="${i.id}" role="checkbox" aria-checked="${estado.sos.includes(i.id)}">${ICON.check}</button>
          </div>`).join('')}
        </div>
        <p class="hint">A hora da toma fica associada à crise com precisão de minutos.</p>` : ''}

      <label class="fld mt16"><span>Notas da crise</span>
        <textarea data-notas placeholder="Aura, náuseas, visão turva, o que estava a fazer…">${esc(aEditar?.notas || '')}</textarea></label>
    </div>`);

  const { fechar } = sheet({
    titulo: emCurso ? 'Crise em curso' : aEditar ? 'Editar crise' : 'Iniciar crise',
    sub: aEditar
      ? `${dataLonga(aEditar.data)} · ${hhmm(new Date(aEditar.dataInicio))}`
      : 'o temporizador começa assim que gravar',
    corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Cancelar</button>
            <button class="btn btn-primary" data-gravar>${aEditar ? 'Guardar alterações' : 'Iniciar e cronometrar'}</button>`,
  });

  const setPct = (input) => {
    const p = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--pct', p + '%');
  };
  const range = corpo.querySelector('[data-int]');
  setPct(range);
  const sincronizarInt = () => {
    estado.intensidade = +range.value;
    const v = corpo.querySelector('[data-val]'), l = corpo.querySelector('[data-lbl]');
    v.textContent = range.value;
    v.style.color = corIntensidade(+range.value);
    l.textContent = `${range.value} · ${intensidadeLabel(+range.value)}`;
    range.style.setProperty('--fill', corIntensidade(+range.value));
    setPct(range);
    haptic(3);
  };
  range.addEventListener('input', sincronizarInt);

  if (!aEditar) {
    corpo.querySelector('#px').innerHTML = pressao.hpa == null
      ? 'Sem leitura de pressão disponível offline.'
      : `Pressão <b>${fmt(pressao.hpa, 1)} hPa</b> · variação 6 h: <b style="color:${pressao.delta <= -2 ? '#f87171' : '#34d399'}">${pressao.delta > 0 ? '+' : ''}${fmt(pressao.delta, 1)} hPa</b>`;
  }

  on(corpo, 'click', '.chip[data-zona]', (e, b) => {
    const id = b.dataset.zona;
    estado.zonas = estado.zonas.includes(id) ? estado.zonas.filter(z => z !== id) : [...estado.zonas, id];
    b.setAttribute('aria-pressed', estado.zonas.includes(id));
    corpo.querySelectorAll(`.zone[data-zona="${id}"]`).forEach(z => z.setAttribute('aria-pressed', estado.zonas.includes(id)));
    haptic(10);
  });
  // as zonas do mapa delegam para a respetiva etiqueta (evita duplo toggle)
  on(corpo, 'click', 'g.zone[data-zona]', (e, z) => {
    if (z.contains(e.target.closest('.chip'))) return;
    corpo.querySelector(`.chip[data-zona="${z.dataset.zona}"]`)?.click();
  });
  on(corpo, 'keydown', '.zone[data-zona]', (e, z) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); z.click(); } });

  on(corpo, 'click', '[data-gat-il]', (e, b) => {
    const g = b.dataset.gatIl;
    estado.gatilhos = estado.gatilhos.includes(g) ? estado.gatilhos.filter(x => x !== g) : [...estado.gatilhos, g];
    b.setAttribute('aria-pressed', estado.gatilhos.includes(g));
    haptic(6);
  });

  on(corpo, 'click', '[data-sos-id]', async (e, b) => {
    const id = b.dataset.sosId;
    estado.sos = estado.sos.includes(id) ? estado.sos.filter(x => x !== id) : [...estado.sos, id];
    b.setAttribute('aria-checked', estado.sos.includes(id));
    haptic(12);
  });

  /* As tomas SOS foram marcadas agora: criar TomaMedicacao com a hora exata.
     Numa crise já terminada não inventamos uma hora — só fica a associação. */
  async function registarSOS(ids) {
    if (!ids.length) return;
    const agora = new Date();
    for (const itemId of ids) {
      const t = await tomasDoDia(diaKey());
      if (!t.some(x => x.itemId === itemId && x.hora === hhmm(agora))) await toggleToma(itemId, agora);
    }
  }

  const btnGravar = corpo.closest('.sheet').querySelector('[data-gravar]');
  btnGravar.addEventListener('click', async () => {
    btnGravar.disabled = true;
    const notas = corpo.querySelector('[data-notas]').value.trim();
    if (aEditar) {
      await updateCrise(aEditar.id, {
        zonas: estado.zonas, intensidade: estado.intensidade,
        gatilhos: estado.gatilhos, tomaMedicacaoIds: estado.sos, notas,
      });
      if (emCurso) await registarSOS(estado.sos.filter(id => !sosIniciais.has(id)));
    } else {
      const alvo = await iniciarCrise({ zonas: estado.zonas, intensidade: estado.intensidade, gatilhos: estado.gatilhos, notas });
      await updateCrise(alvo.id, {
        pressaoInicioHpa: pressao?.hpa ?? null, deltaPressao6hHpa: pressao?.delta ?? null,
        tomaMedicacaoIds: estado.sos,
      });
      await registarSOS(estado.sos);
      if (pressao?.hpa != null) await patchDia(diaKey(), { pressaoHpa: pressao.hpa });
    }
    haptic(aEditar ? [8, 40, 8] : [12, 60, 12]);
    toast(aEditar ? 'Crise atualizada' : 'Cronómetro da crise iniciado');
    fechar(); refresh();
  });

  return fechar;
}

/** Cartão de crise em curso, com cronómetro a avançar. */
export function cardCriseAtiva(crise, { aoTerminar } = {}) {
  const node = el(`
    <div class="card" style="border-color:rgba(248,113,113,.4);background:linear-gradient(160deg,rgba(248,113,113,.14),rgba(255,255,255,.03))">
      <div class="split">
        <div>
          <div class="metric-label" style="color:#fca5a5">Crise em curso · desde ${hhmm(new Date(crise.dataInicio))}</div>
          <div class="timer-live" data-chrono>00:00:00</div>
          <div class="metric-foot">Intensidade <b>${crise.intensidade}/10</b> · ${esc((crise.zonas || []).map(z => ZONAS_CABECA.find(x => x.id === z)?.nome || z).join(', ') || 'zona por definir')}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-sm" data-edit>Editar</button>
          <button class="btn btn-sm btn-primary" data-end>Terminar</button>
        </div>
      </div>
    </div>`);

  const t0 = new Date(crise.dataInicio).getTime();
  const chrono = node.querySelector('[data-chrono]');
  const tick = () => {
    const s = Math.max(0, Math.floor((Date.now() - t0) / 1000));
    chrono.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':');
  };
  tick();
  const iv = setInterval(tick, 1000);
  const obs = new MutationObserver(() => { if (!node.isConnected) { clearInterval(iv); obs.disconnect(); } });
  obs.observe(document.getElementById('view'), { childList: true });

  node.querySelector('[data-edit]').onclick = () => sheetCrise(crise);
  node.querySelector('[data-end]').onclick = async () => {
    const fim = new Date();
    const extra = {};
    if (!crise.pressaoInicioHpa) { const p = await capturarPressao(fim); extra.pressaoFimHpa = p.hpa; }
    await terminarCrise(crise.id, extra);
    haptic([10, 50, 10]);
    toast('Crise terminada e cronometrada');
    aoTerminar ? aoTerminar() : refresh();
  };
  return node;
}

/* ----------------------------------------------------------- digestivo -- */

export async function sheetDigestivo(data = diaKey()) {
  const corpo = el(`
    <div>
      <div class="section-title" style="margin-top:0">Escala de Bristol</div>
      <div class="bristol" data-bristol>
        ${BRISTOL.map(b => `<button data-tipo="${b.tipo}" aria-pressed="false" title="${esc(b.nome)} — ${esc(b.desc)}">
          ${bristolSVG(b.tipo)}<span class="n">${b.tipo}</span></button>`).join('')}
      </div>
      <p class="hint" data-desc style="margin-top:10px">Escolha o aspeto das fezes. A hora do evento é registada automaticamente.</p>

      <label class="fld"><span>Hora (opcional, se não foi agora)</span><input type="time" data-hora value="${hhmm(new Date())}"></label>

      <div class="section-title mt16">Hemorroidas / fissuras</div>
      <div class="card">
        <div class="slider-top"><span class="slider-name">Desconforto</span><span class="slider-read" data-dv>0</span></div>
        <input type="range" min="0" max="10" value="0" data-desc-slider>
        <div class="slider-scale"><span>sem desconforto</span><span>intenso</span></div>
        <div class="switch mt12"><span class="switch-label">Sangramento<small>verificado nesta evacuação</small></span>
          <button class="track" data-sang role="switch" aria-checked="false"></button></div>
        <div class="chips mt12">
          ${['Esforço', 'Stress', 'Dieta pobre em fibra', 'Pouca água', 'Viajar', 'Ficar muito sentado']
            .map(f => `<button class="chip" data-fat="${esc(f)}" aria-pressed="false">${esc(f)}</button>`).join('')}
        </div>
      </div>
    </div>`);

  let tipo = null;
  const fatores = new Set();
  const sang = corpo.querySelector('[data-sang]');
  const slider = corpo.querySelector('[data-desc-slider]');
  const setPct = () => slider.style.setProperty('--pct', (slider.value * 10) + '%');
  setPct();
  slider.oninput = () => { corpo.querySelector('[data-dv]').textContent = slider.value; setPct(); haptic(3); };
  sang.onclick = () => sang.setAttribute('aria-checked', sang.getAttribute('aria-checked') !== 'true');

  on(corpo, 'click', '[data-tipo]', (e, b) => {
    tipo = +b.dataset.tipo;
    corpo.querySelectorAll('[data-tipo]').forEach(x => x.setAttribute('aria-pressed', x === b));
    corpo.querySelector('[data-desc]').innerHTML =
      `<b>Tipo ${tipo} — ${esc(BRISTOL[tipo - 1].nome)}</b> · ${esc(BRISTOL[tipo - 1].desc)}`;
    haptic(10);
  });
  on(corpo, 'click', '[data-fat]', (e, b) => {
    const f = b.dataset.fat;
    fatores.has(f) ? fatores.delete(f) : fatores.add(f);
    b.setAttribute('aria-pressed', fatores.has(f));
  });

  const { fechar } = sheet({
    titulo: 'Registo digestivo', sub: data === diaKey() ? 'Hoje' : data, corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Cancelar</button>
            <button class="btn btn-primary" data-gravar>Gravar registo</button>`,
  });

  corpo.closest('.sheet').querySelector('[data-gravar]').onclick = async () => {
    if (!tipo) { toast('Escolha um tipo de Bristol', 'err'); return; }
    const desconforto = +slider.value;
    const quando = new Date(`${data}T00:00`);
    const [h, mi] = corpo.querySelector('[data-hora]').value.split(':').map(Number);
    if (!Number.isNaN(h)) quando.setHours(h, mi, 0, 0);
    await adicionarFezes({
      tipo,
      quando,
      hemorroides: (desconforto > 0 || sang.getAttribute('aria-checked') === 'true' || fatores.size)
        ? { desconforto, sangramento: sang.getAttribute('aria-checked') === 'true', fatores: [...fatores] }
        : null,
    });
    haptic([8, 30, 8]);
    toast('Registo digestivo guardado');
    fechar(); refresh();
  };
}

/* ------------------------------------------------------- afrontamentos --- */

/** Registo de calor súbito/afrontamento, no dia escolhido. */
export async function sheetAfrontamento(data = diaKey()) {
  const dia = await getDia(data);
  const existentes = dia.afrontamentos || [];
  const corpo = el(`
    <div>
      <div class="note">
        <b>Afrontamento</b> — calor súbito, suores ou rubor. Registe a intensidade e a hora;
        fica associado a ${data === diaKey() ? 'hoje' : esc(dataLonga(data))}.
      </div>
      <div class="section-title mt20">Intensidade</div>
      <div class="card">
        <div class="slider-top">
          <span class="slider-name">${ICON.termo} <span data-lbl>4 · moderado</span></span>
          <span class="slider-read" data-val style="color:#fb923c">4</span>
        </div>
        <input type="range" min="1" max="10" step="1" value="4" data-int style="--fill:#fb923c">
        <div class="slider-scale"><span>ligeiro</span><span>muito intenso</span></div>
      </div>
      <label class="fld mt16"><span>Hora</span>
        <input type="time" data-hora value="${hhmm(new Date())}"></label>
      <label class="fld"><span>Notas (opcional)</span>
        <input type="text" data-notas placeholder="Ex.: depois do café, antes do jantar…"></label>
      <p class="hint">${existentes.length
        ? `${existentes.length} afrontamento${existentes.length > 1 ? 's' : ''} registado${existentes.length > 1 ? 's' : ''} neste dia.`
        : 'Ainda sem afrontamentos neste dia.'}</p>
    </div>`);

  const range = corpo.querySelector('[data-int]');
  const pintar = () => {
    const v = +range.value;
    corpo.querySelector('[data-val]').textContent = v;
    corpo.querySelector('[data-lbl]').textContent = `${v} · ${v <= 3 ? 'ligeiro' : v <= 6 ? 'moderado' : 'intenso'}`;
    range.style.setProperty('--pct', ((v - 1) / 9) * 100 + '%');
    haptic(3);
  };
  pintar();
  range.addEventListener('input', pintar);

  const { fechar } = sheet({
    titulo: 'Afrontamento', sub: data === diaKey() ? 'Hoje' : dataLonga(data), corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Cancelar</button>
            <button class="btn btn-primary" data-gravar>Registar</button>`,
  });

  corpo.closest('.sheet').querySelector('[data-gravar]').onclick = async () => {
    const quando = new Date(`${data}T00:00`);
    const [h, m] = corpo.querySelector('[data-hora]').value.split(':').map(Number);
    if (!Number.isNaN(h)) quando.setHours(h, m || 0, 0, 0);
    await adicionarAfrontamento({
      intensidade: +range.value,
      notas: corpo.querySelector('[data-notas]').value,
      quando,
    });
    haptic([8, 30, 8]);
    toast('Afrontamento registado');
    fechar(); refresh();
  };
}

/* ---------------------------------------------------------- refeições --- */

export async function sheetRefeicao({ data = diaKey() } = {}) {
  const fotos = [];
  const corpo = el(`
    <div>
      <label class="fld"><span>O que comeu / bebeu</span>
        <textarea data-txt placeholder="Pequeno-almoço: café com leite, torrada com manteiga…"></textarea></label>
      <div class="grid2">
        <label class="fld"><span>Calorias (opcional)</span>
          <input type="number" min="0" step="10" data-kcal placeholder="Ex.: 420"></label>
        <label class="fld"><span>Hora</span>
          <input type="time" data-hora value="${hhmm(new Date())}"></label>
      </div>
      <div class="section-title">Fotografias</div>
      <input type="file" accept="image/*" capture="environment" multiple data-foto style="display:none">
      <button class="btn btn-ghost btn-block" data-addfoto>${ICON.comida} Adicionar foto</button>
      <div class="grid3 mt12" data-galeria></div>
      <p class="hint mt12">Estruturado para integração futura com uma API de contagem automática de calorias.</p>
    </div>`);

  const { fechar } = sheet({
    titulo: 'Alimentação',
    sub: data === diaKey() ? 'Registo simplificado' : dataLonga(data),
    corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Cancelar</button><button class="btn btn-primary" data-gravar>Guardar</button>`,
  });

  const input = corpo.querySelector('[data-foto]');
  corpo.querySelector('[data-addfoto]').onclick = () => input.click();
  input.onchange = () => {
    [...input.files].slice(0, 3).forEach(f => {
      const rd = new FileReader();
      rd.onload = () => {
        fotos.push(rd.result);
        corpo.querySelector('[data-galeria]').insertAdjacentHTML('beforeend',
          `<img src="${rd.result}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;border:1px solid var(--stroke)">`);
      };
      rd.readAsDataURL(f);
    });
  };

  corpo.closest('.sheet').querySelector('[data-gravar]').onclick = async () => {
    const texto = corpo.querySelector('[data-txt]').value.trim();
    if (!texto && !fotos.length) { toast('Escreva o que comeu', 'err'); return; }
    const quando = new Date(`${data}T00:00`);
    const [h, m] = corpo.querySelector('[data-hora]').value.split(':').map(Number);
    if (!Number.isNaN(h)) quando.setHours(h, m || 0, 0, 0);
    await adicionarRefeicao({ texto, calorias: +corpo.querySelector('[data-kcal]').value || null, fotos, quando });
    toast('Refeição registada'); fechar(); refresh();
  };
}

/* ------------------------------------------------- item da farmácia ----- */

export async function sheetItemFarmacia(item = null) {
  const corpo = el(`
    <div>
      <label class="fld"><span>Nome</span><input type="text" data-nome value="${esc(item?.nome || '')}" placeholder="Ex.: Triptano / Magnésio"></label>
      <label class="fld"><span>Dosagem</span><input type="text" data-dose value="${esc(item?.dosagem || '')}" placeholder="Ex.: 50 mg"></label>
      <label class="fld"><span>Categoria</span>
        <select data-cat>
          <option value="medicamento"${item?.categoria === 'medicamento' ? ' selected' : ''}>Medicamento</option>
          <option value="suplemento"${item?.categoria === 'suplemento' ? ' selected' : ''}>Suplemento</option>
        </select></label>
      <div class="section-title">Horários habituais</div>
      <div class="chips" data-hs>
        ${['08:00', '14:00', '21:00'].map(h => `<button class="chip" data-h="${h}"
          aria-pressed="${(item?.tomarAs || []).includes(h)}">${h}</button>`).join('')}
        <button class="chip" data-h="outro" aria-pressed="false">+ hora</button>
      </div>
    </div>`);

  const horas = new Set(item?.tomarAs || []);
  on(corpo, 'click', '[data-h]', (e, b) => {
    if (b.dataset.h === 'outro') {
      const v = prompt('Hora (HH:MM)', '12:30');
      if (!/^\d{1,2}:\d{2}$/.test(v || '')) return;
      const [hh, mm] = v.split(':').map(n => String(n).padStart(2, '0'));
      horas.add(`${hh}:${mm}`);
      b.insertAdjacentHTML('beforebegin', `<button class="chip on" data-h="${hh}:${mm}" aria-pressed="true">${hh}:${mm}</button>`);
      return;
    }
    const h = b.dataset.h;
    horas.has(h) ? horas.delete(h) : horas.add(h);
    b.setAttribute('aria-pressed', horas.has(h));
  });

  const { fechar } = sheet({
    titulo: item ? 'Editar item' : 'Novo item', corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Cancelar</button><button class="btn btn-primary" data-gravar>Guardar</button>`,
  });

  corpo.closest('.sheet').querySelector('[data-gravar]').onclick = async () => {
    const nome = corpo.querySelector('[data-nome]').value.trim();
    if (!nome) { toast('Indique o nome', 'err'); return; }
    await salvarItem({
      ...(item || {}), nome,
      dosagem: corpo.querySelector('[data-dose]').value.trim(),
      categoria: corpo.querySelector('[data-cat]').value,
      tomarAs: [...horas].sort(),
    });
    toast('Farmácia atualizada'); fechar(); refresh();
  };
}
