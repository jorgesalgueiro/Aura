/* ==========================================================================
   screens/comida.js — refeições com calorias a partir de alimentos
   --------------------------------------------------------------------------
   Fluxo: procurar por nome ou ler/escrever o código de barras → escolher a
   quantidade → somar à refeição. Os alimentos personalizados e a cache do
   Open Food Facts ficam no dispositivo. A refeição guarda o detalhe dos
   itens em `itens`, além do total em `calorias` (compatível com relatórios).
   ========================================================================== */

import { diaKey, hhmm, adicionarRefeicao, apagarRefeicao } from '../store.js';
import {
  buscarProduto, pesquisarAlimentos, pesquisarLocais, sugestoes, salvarCustom, listarCustom, apagarCustom,
  itemDe, kcalDe, guardarNaCache, fonteNome,
} from '../alimentos.js';
import { lerCodigo, prepararScanner } from '../scanner.js';
import { el, esc, sheet, toast, haptic, ICON, fmt, dataLonga, on } from '../utils.js';
import { refresh } from '../nav.js';

const totalDe = (itens) => itens.reduce((a, i) => a + (Number(i.kcal) || 0), 0);

/* ----------------------------------------------------------- quantidade -- */

export function sheetQuantidade(produto, { aoAdicionar } = {}) {
  const unidade = produto.unidade || 'g';
  const inicial = produto.dose || 100;
  const corpo = el(`
    <div>
      <div class="metric-label">${esc(produto.marca || 'Alimento')}</div>
      <div style="font-size:18px;font-weight:650;margin-top:2px">${esc(produto.nome)}</div>
      <p class="hint mt8">${fmt(produto.kcal100, 1)} kcal por 100 ${unidade}
        · ${fonteNome(produto.fonte)}${produto.cache ? ' · guardado' : ''}${produto.desatualizado ? ' · cópia antiga' : ''}</p>

      <label class="fld mt12"><span>Quantidade (${unidade})</span>
        <input type="text" inputmode="decimal" data-qtd value="${inicial}" autocomplete="off"></label>
      <div class="chips mt8" data-rapidos>
        ${[50, 100, 150, 200].map(v => `<button class="chip" data-q="${v}" aria-pressed="${v === inicial}">${v} ${unidade}</button>`).join('')}
        ${produto.dose ? `<button class="chip" data-q="${produto.dose}" aria-pressed="${produto.dose === inicial}">1 dose · ${fmt(produto.dose)} ${unidade}</button>` : ''}
      </div>

      <div class="note mt12 center"><b data-kcal style="font-size:22px">—</b> kcal</div>
      <p class="hint" style="text-align:center">Valor estimado a partir de ${fmt(produto.kcal100, 1)} kcal/100 ${unidade}.</p>
    </div>`);

  const input = corpo.querySelector('[data-qtd]');
  const kcalEl = corpo.querySelector('[data-kcal]');
  const chips = [...corpo.querySelectorAll('[data-q]')];

  const atualizar = () => {
    const kcal = kcalDe(produto, input.value);
    kcalEl.textContent = kcal == null ? '—' : fmt(kcal);
    kcalEl.style.color = kcal == null ? 'var(--text-2)' : 'var(--text)';
    chips.forEach(c => c.setAttribute('aria-pressed', c.dataset.q === String(input.value).trim()));
    return kcal;
  };
  atualizar();

  input.addEventListener('input', atualizar);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); guardar(); }
  });
  on(corpo, 'click', '[data-q]', (e, b) => {
    input.value = b.dataset.q;
    atualizar();
    haptic(4);
  });

  const { fechar } = sheet({
    titulo: 'Quantidade', sub: 'Adicionar à refeição', corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Cancelar</button>
            <button class="btn btn-primary" data-adicionar>Adicionar</button>`,
  });

  function guardar() {
    const kcal = kcalDe(produto, input.value);
    if (kcal == null) { toast('Indique uma quantidade entre 1 e 5000 g/ml.', 'err'); input.focus(); return; }
    const item = itemDe(produto, input.value);
    if (typeof aoAdicionar === 'function') aoAdicionar(item);
    guardarNaCache(produto).catch(() => {});
    haptic([8, 30, 8]);
    fechar();
  }
  corpo.closest('.sheet').querySelector('[data-adicionar]').onclick = guardar;

  return fechar;
}

/* ------------------------------------------------------ alimento extra -- */

export async function sheetAlimentoCustom({ aoGuardar } = {}) {
  const corpo = el(`
    <div>
      <p class="hint" style="margin-top:0">Use os valores do rótulo, por 100 g ou 100 ml.
        Fica guardado só neste dispositivo e aparece na pesquisa.</p>
      <label class="fld"><span>Nome</span>
        <input type="text" data-nome placeholder="Ex.: Sopa da avó" autocomplete="off"></label>
      <label class="fld"><span>Marca (opcional)</span>
        <input type="text" data-marca placeholder="Ex.: caseiro" autocomplete="off"></label>
      <div class="grid2">
        <label class="fld"><span>Calorias por 100</span>
          <input type="number" min="0" max="1000" step="1" data-kcal100 placeholder="Ex.: 85"></label>
        <label class="fld"><span>Unidade</span>
          <select data-unidade><option value="g">gramas (g)</option><option value="ml">mililitros (ml)</option></select></label>
      </div>
      <label class="fld"><span>Dose habitual (opcional)</span>
        <input type="number" min="1" max="5000" step="1" data-dose placeholder="Ex.: 300"></label>
      <div data-custom-lista class="mt16"></div>
    </div>`);

  const { fechar } = sheet({
    titulo: 'Novo alimento', sub: 'Valores por 100 g/ml', corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Cancelar</button>
            <button class="btn btn-primary" data-guardar-custom>Guardar alimento</button>`,
  });

  const listaEl = corpo.querySelector('[data-custom-lista]');
  const desenharLista = async () => {
    const lista = await listarCustom();
    listaEl.innerHTML = lista.length
      ? `<div class="section-title">Os meus alimentos</div>
         <div class="list">${lista.map(p => `<div class="row">
           <span class="row-ico" style="color:var(--teal)">${ICON.comida}</span>
           <div class="row-main"><div class="row-title">${esc(p.nome)}</div>
             <div class="row-sub">${fmt(p.kcal100, 1)} kcal/100 ${p.unidade}${p.marca ? ' · ' + esc(p.marca) : ''}</div></div>
           <div class="row-end"><button class="icon-btn" data-apagar-custom="${esc(p.id)}" aria-label="Apagar ${esc(p.nome)}">${ICON.lixo}</button></div>
         </div>`).join('')}</div>`
      : '';
  };
  desenharLista();

  on(corpo, 'click', '[data-apagar-custom]', async (e, b) => {
    if (!confirm('Apagar este alimento personalizado?')) return;
    await apagarCustom(b.dataset.apagarCustom);
    toast('Alimento apagado');
    desenharLista();
  });

  corpo.closest('.sheet').querySelector('[data-guardar-custom]').onclick = async () => {
    try {
      const p = await salvarCustom({
        nome: corpo.querySelector('[data-nome]').value,
        marca: corpo.querySelector('[data-marca]').value,
        kcal100: corpo.querySelector('[data-kcal100]').value,
        unidade: corpo.querySelector('[data-unidade]').value,
        dose: corpo.querySelector('[data-dose]').value,
      });
      haptic([10, 40, 10]);
      toast(`“${p.nome}” guardado`);
      fechar();
      if (typeof aoGuardar === 'function') aoGuardar(p);
    } catch (e) {
      toast(e.message || 'Não foi possível guardar', 'err');
    }
  };

  return fechar;
}

/* -------------------------------------------------------------- refeição -- */

export async function sheetRefeicao({ data = diaKey() } = {}) {
  const itens = [];
  const fotos = [];
  let resultados = [];
  let seqBusca = 0;

  const corpo = el(`
    <div>
      <div class="section-title" style="margin-top:0">Adicionar alimento</div>
      <div class="card card-tight">
        <div class="split" style="gap:8px">
          <input type="search" data-busca placeholder="Procurar por nome (ex.: iogurte)" autocomplete="off">
          <button class="icon-btn" data-scan aria-label="Ler código de barras" title="Ler código de barras">${ICON.codigo}</button>
        </div>
        <div class="btn-row mt8">
          <button class="btn btn-sm" data-procurar>Procurar</button>
          <button class="btn btn-sm btn-ghost" data-toggle-codigo>Código de barras</button>
          <button class="btn btn-sm btn-ghost" data-custom>Novo alimento</button>
        </div>
        <div data-codigo-wrap hidden class="mt8">
          <div class="split" style="gap:8px">
            <input type="text" inputmode="numeric" data-codigo placeholder="Ex.: 5601234567890" autocomplete="off" spellcheck="false">
            <button class="btn btn-sm" data-codigo-usar>Usar</button>
          </div>
        </div>
        <div data-estado-pesquisa class="hint mt8" hidden></div>
        <div data-resultados class="list mt8"></div>
      </div>

      <div class="section-title mt20">Nesta refeição</div>
      <div class="card card-tight">
        <div data-lista-itens></div>
        <p class="hint" data-vazio style="margin:0">Ainda não adicionaste alimentos. Podes somar vários.</p>
        <div class="split mt12"><span class="muted">Total</span><b data-total>0 kcal</b></div>
      </div>

      <div class="grid2 mt12">
        <label class="fld"><span>Calorias manuais</span>
          <input type="number" min="0" step="10" data-kcal placeholder="Ex.: 420"></label>
        <label class="fld"><span>Hora</span>
          <input type="time" data-hora value="${hhmm(new Date())}"></label>
      </div>
      <p class="hint" data-kcal-hint style="margin-top:6px">As calorias manuais só são usadas quando não adicionas alimentos.</p>

      <label class="fld"><span>Notas (opcional)</span>
        <textarea data-txt placeholder="Ex.: almoço fora, sobremesa partilhada…"></textarea></label>

      <div class="section-title">Fotografias</div>
      <input type="file" accept="image/*" capture="environment" multiple data-foto style="display:none">
      <button class="btn btn-ghost btn-block" data-addfoto>${ICON.comida} Adicionar foto</button>
      <div class="grid3 mt12" data-galeria></div>

      <p class="hint mt12">A pesquisa e o código de barras são enviados ao Open Food Facts; nenhum dado pessoal.
        Os valores são por 100 g/ml — confirma sempre o rótulo.</p>
    </div>`);

  const resultadosEl = corpo.querySelector('[data-resultados]');
  const estadoPesquisa = corpo.querySelector('[data-estado-pesquisa]');
  const listaEl = corpo.querySelector('[data-lista-itens]');
  const vazioEl = corpo.querySelector('[data-vazio]');
  const totalEl = corpo.querySelector('[data-total]');
  const manual = corpo.querySelector('[data-kcal]');
  manual.addEventListener('input', () => {
    if (!itens.length) totalEl.textContent = `${fmt(+manual.value || 0)} kcal`;
  });
  const busca = corpo.querySelector('[data-busca]');
  const codigoWrap = corpo.querySelector('[data-codigo-wrap]');
  const codigoInput = corpo.querySelector('[data-codigo]');

  const { fechar } = sheet({
    titulo: 'Alimentação',
    sub: data === diaKey() ? 'Hoje · calorias por alimento' : dataLonga(data),
    corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Cancelar</button>
            <button class="btn btn-primary" data-gravar>Guardar</button>`,
  });
  // deixa o leitor pronto antes de o utilizador tocar na câmara
  prepararScanner();

  function estado(texto) {
    estadoPesquisa.hidden = !texto;
    estadoPesquisa.textContent = texto || '';
  }

  function desenharResultados() {
    if (!resultados.length) {
      resultadosEl.innerHTML = `<p class="hint" style="margin:6px 0 0">Nada encontrado. Podes criar um alimento personalizado.</p>`;
      return;
    }
    resultadosEl.innerHTML = resultados.map((p, i) => `<div class="row tap" data-add-res="${i}" role="button" tabindex="0">
      <span class="row-ico" style="color:var(--teal)">${ICON.comida}</span>
      <div class="row-main">
        <div class="row-title">${esc(p.nome)}</div>
        <div class="row-sub">${p.marca ? esc(p.marca) + ' · ' : ''}${fmt(p.kcal100, 1)} kcal/100 ${p.unidade} · ${fonteNome(p.fonte)}</div>
      </div>
      <div class="row-end"><span class="badge blue">+</span></div>
    </div>`).join('');
  }

  function desenharItens() {
    listaEl.innerHTML = itens.map((it, i) => `<div class="row">
      <span class="row-ico" style="color:var(--teal)">${ICON.comida}</span>
      <div class="row-main">
        <div class="row-title">${esc(it.nome)}</div>
        <div class="row-sub">${fmt(it.quantidade)} ${it.unidade} · ${fmt(it.kcal)} kcal${it.marca ? ' · ' + esc(it.marca) : ''}</div>
      </div>
      <div class="row-end"><button class="icon-btn" data-remover-item="${i}" aria-label="Remover ${esc(it.nome)}">${ICON.lixo}</button></div>
    </div>`).join('');
    vazioEl.hidden = itens.length > 0;

    const total = totalDe(itens);
    manual.disabled = itens.length > 0;
    if (itens.length) {
      if (!manual.dataset.guardado) manual.dataset.guardado = manual.value;
      manual.value = '';
      manual.placeholder = 'automático';
      corpo.querySelector('[data-kcal-hint]').textContent = 'O total vem dos alimentos adicionados; as calorias manuais ficam desativadas.';
    } else {
      if (manual.dataset.guardado != null) { manual.value = manual.dataset.guardado; delete manual.dataset.guardado; }
      manual.placeholder = 'Ex.: 420';
      corpo.querySelector('[data-kcal-hint]').textContent = 'As calorias manuais só são usadas quando não adicionas alimentos.';
    }
    totalEl.textContent = `${fmt(itens.length ? total : (+manual.value || 0))} kcal`;
  }

  function abrirQuantidade(produto) {
    sheetQuantidade(produto, {
      aoAdicionar: (item) => {
        itens.push(item);
        desenharItens();
        toast(`${item.nome}: ${fmt(item.kcal)} kcal`);
      },
    });
  }

  async function porCodigo(bruto) {
    codigoInput.value = String(bruto || '').replace(/\D/g, '');
    estado('a procurar o código…');
    try {
      const p = await buscarProduto(codigoInput.value);
      estado('');
      haptic(6);
      if (p.cache) toast(p.desatualizado ? 'Sem rede: a usar a cópia guardada' : 'Produto guardado no dispositivo', 'warn', 3500);
      abrirQuantidade(p);
    } catch (e) {
      estado(e.message || 'Produto não encontrado');
      haptic([20, 60, 20]);
    }
  }

  async function procurar() {
    const termo = busca.value.trim();
    if (termo.length < 2) { toast('Escreva pelo menos 2 letras.', 'warn'); busca.focus(); return; }
    const seq = ++seqBusca;
    // mostra já os resultados locais; a rede pode demorar
    const rapidos = await pesquisarLocais(termo);
    if (seq !== seqBusca) return;
    if (rapidos.length) { resultados = rapidos; desenharResultados(); }
    estado(rapidos.length ? 'a procurar também no Open Food Facts…' : 'a procurar…');
    const r = await pesquisarAlimentos(termo);
    if (seq !== seqBusca) return;
    const vistos = new Set();
    resultados = [...r.locais, ...r.remotos].filter(p => {
      const k = p.codigo || `${p.nome}|${p.marca}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    }).slice(0, 30);
    estado(r.offline
      ? `${r.erro || 'Sem ligação ao Open Food Facts.'}${resultados.length ? ' A mostrar a tabela local.' : ' Sem resultados locais.'}`
      : (resultados.length ? `${resultados.length} resultados` : 'Nada encontrado no Open Food Facts.'));
    desenharResultados();
  }

  // sugestões imediatas (personalizados + alimentos comuns)
  sugestoes().then((s) => { if (seqBusca === 0) { resultados = s; desenharResultados(); } }).catch(() => {});

  corpo.querySelector('[data-procurar]').onclick = procurar;
  busca.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); procurar(); }
  });

  corpo.querySelector('[data-scan]').onclick = () => lerCodigo({ aoLer: (codigo) => porCodigo(codigo) });
  corpo.querySelector('[data-toggle-codigo]').onclick = () => {
    codigoWrap.hidden = !codigoWrap.hidden;
    if (!codigoWrap.hidden) codigoInput.focus();
  };
  corpo.querySelector('[data-codigo-usar]').onclick = () => porCodigo(codigoInput.value);
  codigoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); porCodigo(codigoInput.value); }
  });

  corpo.querySelector('[data-custom]').onclick = () => sheetAlimentoCustom({
    aoGuardar: (p) => { resultados = [p, ...resultados]; desenharResultados(); abrirQuantidade(p); },
  });

  on(corpo, 'click', '[data-add-res]', (e, b) => {
    const p = resultados[+b.dataset.addRes];
    if (p) abrirQuantidade(p);
  });
  on(corpo, 'keydown', '[data-add-res]', (e, b) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); }
  });
  on(corpo, 'click', '[data-remover-item]', (e, b) => {
    itens.splice(+b.dataset.removerItem, 1);
    desenharItens();
  });

  // fotografias
  const inputFoto = corpo.querySelector('[data-foto]');
  corpo.querySelector('[data-addfoto]').onclick = () => inputFoto.click();
  inputFoto.onchange = () => {
    [...inputFoto.files].slice(0, 3 - fotos.length).forEach((f) => {
      const rd = new FileReader();
      rd.onload = () => {
        fotos.push(rd.result);
        corpo.querySelector('[data-galeria]').insertAdjacentHTML('beforeend',
          `<img src="${rd.result}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;border:1px solid var(--stroke)">`);
      };
      rd.readAsDataURL(f);
    });
    inputFoto.value = '';
  };

  corpo.closest('.sheet').querySelector('[data-gravar]').onclick = async () => {
    const texto = corpo.querySelector('[data-txt]').value.trim();
    if (!itens.length && !texto && !fotos.length) {
      toast('Adicione um alimento, escreva o que comeu ou uma foto.', 'err');
      return;
    }
    const quando = new Date(`${data}T00:00`);
    const [h, m] = corpo.querySelector('[data-hora]').value.split(':').map(Number);
    if (!Number.isNaN(h)) quando.setHours(h, m || 0, 0, 0);
    const manualKcal = itens.length ? null : (+manual.value || null);
    await adicionarRefeicao({
      texto,
      calorias: manualKcal,
      fotos,
      itens,
      quando,
    });
    haptic([10, 40, 10]);
    toast(itens.length ? `Refeição com ${itens.length} alimento${itens.length > 1 ? 's' : ''}` : 'Refeição registada');
    fechar();
    refresh();
  };

  desenharItens();
  return fechar;
}

/* --------------------------------------------------------- detalhe ------- */

export function sheetRefeicaoDetalhe(r) {
  const itens = r.itens || [];
  const corpo = el(`
    <div>
      ${itens.length ? `<div class="list">${itens.map(i => `<div class="row">
        <span class="row-ico" style="color:var(--teal)">${ICON.comida}</span>
        <div class="row-main"><div class="row-title">${esc(i.nome)}</div>
          <div class="row-sub">${fmt(i.quantidade)} ${i.unidade}${i.marca ? ' · ' + esc(i.marca) : ''}</div></div>
        <div class="row-end"><b>${fmt(i.kcal)} kcal</b></div>
      </div>`).join('')}</div>
      <div class="split mt12"><span class="muted">Total</span><b>${r.calorias != null ? fmt(r.calorias) + ' kcal' : '—'}</b></div>`
        : `<div class="note"><b>${r.calorias != null ? fmt(r.calorias) + ' kcal' : 'Sem calorias registadas'}</b><br>
           <span class="muted">${esc(r.texto || 'Refeição sem detalhe de alimentos')}</span></div>`}
      ${r.texto && itens.length ? `<p class="hint mt12">${esc(r.texto)}</p>` : ''}
      <button class="btn btn-sm btn-danger mt16" data-apagar-refeicao>${ICON.lixo} Apagar refeição</button>
    </div>`);

  const { fechar } = sheet({
    titulo: 'Refeição',
    sub: `${dataLonga(r.data)} · ${r.hora}`,
    corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Fechar</button>`,
  });

  corpo.querySelector('[data-apagar-refeicao]').onclick = async () => {
    if (!confirm('Apagar esta refeição?')) return;
    await apagarRefeicao(r.id);
    haptic(8);
    toast('Refeição apagada');
    fechar();
    refresh();
  };

  return fechar;
}
