/* ==========================================================================
   app.js — casca da aplicação: router de abas, pill de clima, definições
   ========================================================================== */

import { route, go, subscribe, rotaFromHash, refresh } from './nav.js';
import {
  settings, saveSettings, exportarTudo, importarTudo, limparDadosPessoais, diaKey, isoOf,
} from './store.js';
import { el, esc, sheet, toast, ICON, on, haptic, folhaAberta } from './utils.js';
import { clima, atualizarClima, observarClima, estadoPill } from './clima.js';
import { geocodar, posicaoAtual } from './weather.js';
import { importarSaude, sheetImportar } from './health-import.js';
import {
  ligacao, ligar, desligar, sincronizar, sincronizarAgora, observarSync, estadoGarmin,
} from './intervals.js';
import { instalada, plataforma, escutarInstalacao, sheetInstalar } from './instalar.js';
import {
  sheetExportarEncriptada, abrirCopiaEncriptada, descreverUltimaCopia,
} from './cofre.js';
import { sheetCrise, sheetAgua, sheetTomas, sheetDigestivo } from './screens/acoes.js';

import * as Dashboard  from './screens/dashboard.js';
import * as Sintomas   from './screens/sintomas.js';
import * as Farmacia   from './screens/farmacia.js';
import * as Relatorios from './screens/relatorios.js';

const ECRAS = {
  dashboard: Dashboard, sintomas: Sintomas, farmacia: Farmacia, relatorios: Relatorios,
};

const view = document.getElementById('view');
const pill = document.getElementById('sync-pill');

/* Contador de renders: trocar de aba depressa não pode deixar um render
   lento de uma aba antiga a substituir o ecrã da aba atual. */
let _renderSeq = 0;

/* ------------------------------------------------------------- render ---- */

async function desenhar() {
  const mod = ECRAS[route.tab] || ECRAS.dashboard;
  const seq = ++_renderSeq;
  const scroll = window.scrollY;
  view.innerHTML = `<div class="skel" style="height:120px"></div>`;
  try {
    const node = await mod.render(view);
    if (seq !== _renderSeq) return;      // outra navegação já tomou conta do ecrã
    view.innerHTML = '';
    const host = typeof node === 'string' ? el(`<div class="fade-in">${node}</div>`) : node;
    view.appendChild(host);
    // O bind recebe o nó do ecrã (e não #view, que persiste entre rotas):
    // assim os listeners morrem com o ecrã e não se acumulam a cada render.
    if (mod.bind) await mod.bind(host);
    if (seq !== _renderSeq) return;
  } catch (e) {
    if (seq !== _renderSeq) return;
    view.innerHTML = `<div class="card"><h2 class="sheet-title">Algo falhou neste ecrã</h2>
      <p class="hint" style="margin-top:8px">${esc(e && e.message || e)}</p>
      <div class="btn-row mt12"><button class="btn btn-sm" data-recarregar>Tentar de novo</button></div></div>`;
    view.querySelector('[data-recarregar]').onclick = desenhar;
    console.error(e);
  }
  marcarAba();
  window.scrollTo(0, scroll > 800 ? 0 : scroll);
}

function marcarAba() {
  document.querySelectorAll('#tabbar .tab').forEach(b => {
    b.setAttribute('aria-selected', String(b.dataset.tab === route.tab));
  });
  desenharPill();
}

function desenharPill() {
  const { txt, cls } = estadoPill();
  pill.className = `pill ${cls}`;
  pill.textContent = txt;
}

/* --------------------------------------------------------- navegação ----- */

document.getElementById('tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  haptic(6);
  go(b.dataset.tab);
});

window.addEventListener('hashchange', () => {
  const { tab, sub } = rotaFromHash();
  if (tab !== route.tab || sub !== route.sub) go(tab, sub);
});

/* Atalhos globais: 1–4 mudam de aba (teclado) */
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const alvo = e.target;
  if (alvo && typeof alvo.matches === 'function'
    && (alvo.matches('input, textarea, select') || alvo.isContentEditable)) return;
  // com uma folha modal aberta, os números pertencem à folha (não à aba de trás)
  if (folhaAberta()) return;
  const mapa = { '1': 'dashboard', '2': 'sintomas', '3': 'farmacia', '4': 'relatorios' };
  if (mapa[e.key]) go(mapa[e.key]);
});

/* ------------------------------------------------------ pill / clima ----- */

observarClima(() => desenharPill());
pill.addEventListener('click', () => { atualizarClima({ forcar: true }); });
pill.title = 'Pressão atmosférica real (Open-Meteo). Toque para atualizar.';

/* -------------------------------------------------------- definições ----- */

export async function sheetDefinicoes() {
  const s = await settings();
  const g = await ligacao();
  const estado = estadoGarmin();

  const corpo = el(`
    <div>
      <div class="section-title" style="margin-top:0">Perfil</div>
      <label class="fld"><span>Nome (aparece na saudação)</span>
        <input type="text" data-nome value="${esc(s.nome)}" placeholder="Opcional"></label>

      <div class="section-title">Localização para o clima</div>
      <label class="fld"><span>Localidade</span>
        <input type="search" data-loc value="${esc(s.localidade)}" placeholder="Ex.: Porto" autocomplete="off"></label>
      <div class="chips" data-geo></div>
      <div class="btn-row mt12">
        <button class="btn btn-sm btn-ghost" data-geo-buscar>${ICON.livro} Procurar</button>
        <button class="btn btn-sm btn-ghost" data-geo-gps>${ICON.pin} Usar GPS</button>
      </div>
      <p class="hint mt12" style="margin-top:10px">Coordenadas atuais: <b data-coord>${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}</b></p>

      <div class="section-title">Hidratação</div>
      <div class="grid2">
        <label class="fld"><span>Objetivo diário (ml)</span>
          <input type="number" min="500" max="6000" step="100" data-obj value="${s.objetivoAguaMl}"></label>
        <label class="fld"><span>Copo / incremento (ml)</span>
          <input type="number" min="50" max="1000" step="10" data-inc value="${s.incrementoAguaMl}"></label>
      </div>

      <div class="section-title">Sensações</div>
      <div class="switch"><span class="switch-label">Feedback háptico<small>vibração nos controlos (Android; iOS não expõe a API)</small></span>
        <button class="track" data-hap role="switch" aria-checked="${!!s.haptics}"></button></div>

      <div class="section-title">Garmin · automático</div>
      <div class="card card-tight">
        <div class="metric-label">Sincronização</div>
        <div class="metric-foot" data-garmin-estado style="color:${estado.classe === 'red' ? 'var(--red)' : estado.classe === 'green' ? 'var(--green)' : ''}">${esc(estado.texto)}</div>
        <label class="fld mt12"><span>Chave da API do Intervals.icu</span>
          <input type="password" data-gkey value="${esc(g.chave)}" placeholder="cole aqui a chave" autocomplete="off" spellcheck="false"></label>
        <label class="fld"><span>ID de atleta <small style="font-weight:400">· 0 = a conta da chave</small></span>
          <input type="text" data-gid value="${esc(g.athleteId || '0')}" placeholder="0 ou i12345" autocomplete="off" spellcheck="false"></label>
        <div class="btn-row">
          <button class="btn btn-sm btn-primary" data-gligar>${estado.ligado ? 'Testar de novo' : 'Ligar'}</button>
          <button class="btn btn-sm" data-gsync ${estado.ligado ? '' : 'disabled'}>Sincronizar agora</button>
          <button class="btn btn-sm btn-ghost" data-gdesligar ${estado.ligado ? '' : 'hidden'}>Desligar</button>
        </div>
        <details class="mt12">
          <summary>Como obter a chave (3 passos)</summary>
          <ol class="steps">
            <li>Em <b>intervals.icu</b> crie a conta gratuita e abra <b>Definições</b>.</li>
            <li>No bloco <b>Garmin Connect</b> ligue a conta e active <b>Download wellness data</b>
              (e <i>Import all Garmin data</i> para trazer o histórico).</li>
            <li>No fim das Definições, <b>Developer Settings</b> → copie a <b>API key</b> para o campo acima.</li>
          </ol>
          <p class="hint" style="margin-top:12px">A chave fica só neste dispositivo, não entra nas cópias de segurança e é apagada
            se desligar. Sono, VFC, passos, peso e calorias das atividades passam a entrar sozinhos —
            nunca substituem valores escritos à mão.</p>
        </details>
      </div>

      <div class="section-title">Cópia de segurança</div>
      <div class="card card-tight">
        <div class="metric-label">Cópia encriptada · .aura</div>
        <div class="metric-foot" data-copia-estado>Ainda não guardaste nenhuma cópia.</div>
        <p class="hint mt8">Um ficheiro que só abre com uma passphrase que escolhes. Guarda-o na
          pasta Aura, no iCloud ou no Drive. <b>A passphrase não fica guardada</b> — sem ela,
          nem tu nem a app conseguem abrir a cópia.</p>
        <div class="btn-row mt12">
          <button class="btn btn-sm btn-primary" data-copia-exportar>${ICON.download} Exportar encriptada</button>
          <button class="btn btn-sm" data-copia-abrir>${ICON.upload} Abrir cópia encriptada</button>
        </div>
        <input type="file" accept=".aura" data-ficheiro-cofre style="display:none">
      </div>

      <div class="section-title">Os seus dados</div>
      <div class="note" style="margin-bottom:12px">
        Tudo fica <b>guardado neste dispositivo</b> (IndexedDB). Não há servidor nem conta.
        O <b>clima é real</b> (Open-Meteo); o <b>sono, peso, passos e VFC</b> entram por importação
        do Apple Saúde ou do Garmin Connect — ou automaticamente pelo Garmin, em cima.
      </div>
      <div class="btn-row">
        <button class="btn btn-sm" data-imp>${ICON.upload} Importar Saúde / Garmin</button>
        <button class="btn btn-sm btn-ghost" data-backup>${ICON.download} Exportar JSON</button>
        <button class="btn btn-sm btn-ghost" data-restore>${ICON.upload} Restaurar JSON</button>
      </div>
      <p class="hint mt8">O JSON é legível por qualquer pessoa — usa-o só para mover dados entre
        aparelhos. Para guardar, prefere a cópia encriptada em cima.</p>
      <div class="btn-row mt12">
        <button class="btn btn-sm btn-ghost" data-exemplo>${ICON.grafico} Carregar dados de exemplo</button>
        <button class="btn btn-sm btn-danger" data-apagar>${ICON.lixo} Apagar registos</button>
      </div>
      <input type="file" accept=".json,.xml,.csv,.zip" data-ficheiro style="display:none">

      <div class="section-title">Aplicação</div>
      <div class="card card-tight">
        <div class="metric-label">Ecrã principal</div>
        <div class="metric-foot" data-instalar-estado>${instalada()
          ? 'Já está instalada — está a correr a partir do ícone.'
          : (plataforma() === 'ios'
            ? 'No Safari: Partilhar → Adicionar ao Ecrã Principal.'
            : 'No Chrome: menu ⋮ → Instalar aplicação.')}</div>
        ${instalada() ? '' : '<button class="btn btn-sm btn-block mt12" data-instalar-abrir>Instalar no ecrã principal</button>'}
        <p class="hint mt12">Instalar não envia dados para lado nenhum e não apaga registos.</p>
      </div>
    </div>`);

  const hap = corpo.querySelector('[data-hap]');
  hap.onclick = () => hap.setAttribute('aria-checked', hap.getAttribute('aria-checked') !== 'true');

  /* --- Garmin via Intervals.icu --------------------------------------- */
  const gEstado = corpo.querySelector('[data-garmin-estado]');
  const gLigar = corpo.querySelector('[data-gligar]');
  const gSync = corpo.querySelector('[data-gsync]');
  const gDesligar = corpo.querySelector('[data-gdesligar]');

  const pintarGarmin = () => {
    if (!gEstado.isConnected) { desinscrever(); return; }
    const e = estadoGarmin();
    gEstado.textContent = e.texto;
    gEstado.style.color = e.classe === 'red' ? 'var(--red)' : e.classe === 'green' ? 'var(--green)' : '';
    const ligado = e.ligado;
    gSync.disabled = !ligado;
    gDesligar.hidden = !ligado;
    gLigar.textContent = ligado ? 'Testar de novo' : 'Ligar';
  };
  const desinscrever = observarSync(pintarGarmin);

  gLigar.onclick = async () => {
    const antes = gLigar.textContent;
    gLigar.disabled = true; gLigar.textContent = 'a ligar…';
    try {
      const r = await ligar({
        athleteId: corpo.querySelector('[data-gid]').value,
        chave: corpo.querySelector('[data-gkey]').value,
      });
      haptic([10, 40, 10]);
      toast(r.nome ? `Garmin ligado · ${r.nome}` : 'Garmin ligado');
      if (r.resumo && r.resumo.dias) refresh();
    } catch (e) {
      toast(e.message || 'Não foi possível ligar ao Intervals.icu', 'err', 6000);
    } finally {
      gLigar.disabled = false;
      gLigar.textContent = antes;
      pintarGarmin();
    }
  };

  gSync.onclick = async () => {
    const antes = gSync.textContent;
    gSync.disabled = true; gSync.textContent = 'a sincronizar…';
    try {
      const r = await sincronizarAgora({ dias: 30 });
      haptic(8);
      if (r && r.dias) refresh();
    } finally {
      gSync.disabled = false; gSync.textContent = antes;
      pintarGarmin();
    }
  };

  gDesligar.onclick = async () => {
    if (!confirm('Desligar o Garmin? A chave da API é apagada deste dispositivo.')) return;
    await desligar();
    corpo.querySelector('[data-gkey]').value = '';
    haptic(8);
    pintarGarmin();
    toast('Garmin desligado');
  };

  const abrirInstalar = corpo.querySelector('[data-instalar-abrir]');
  if (abrirInstalar) abrirInstalar.onclick = () => sheetInstalar();

  const coord = corpo.querySelector('[data-coord]');
  const chips = corpo.querySelector('[data-geo]');
  let escolha = { lat: s.lat, lon: s.lon, nome: s.localidade };

  async function buscar() {
    const q = corpo.querySelector('[data-loc]').value;
    chips.innerHTML = `<span class="muted">a procurar…</span>`;
    try {
      const r = await geocodar(q);
      chips.innerHTML = r.length
        ? r.map((x, i) => `<button class="chip" data-g="${i}">${esc(x.nome)}${x.distrito ? ' · ' + esc(x.distrito) : ''}</button>`).join('')
        : `<span class="muted">Sem resultados para “${esc(q)}”.</span>`;
      chips._r = r;
    } catch (e) {
      chips.innerHTML = `<span class="muted">Procura indisponível offline.</span>`;
    }
  }
  corpo.querySelector('[data-geo-buscar]').onclick = buscar;
  on(chips, 'click', '[data-g]', (e, b) => {
    const x = (chips._r || [])[+b.dataset.g];
    if (!x) return;
    chips.querySelectorAll('[data-g]').forEach(c => c.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true');
    escolha = x;
    corpo.querySelector('[data-loc]').value = x.nome;
    coord.textContent = `${x.lat.toFixed(3)}, ${x.lon.toFixed(3)}`;
  });
  corpo.querySelector('[data-geo-gps]').onclick = async () => {
    const btn = corpo.querySelector('[data-geo-gps]');
    btn.disabled = true; btn.textContent = 'a localizar…';
    try {
      const p = await posicaoAtual();
      escolha = Object.assign({ nome: 'A minha posição' }, p);
      corpo.querySelector('[data-loc]').value = escolha.nome;
      coord.textContent = `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`;
      toast('Localização obtida');
    } catch (e) { toast(e.message, 'err'); }
    btn.disabled = false; btn.innerHTML = `${ICON.pin} Usar GPS`;
  };

  const ficheiro = corpo.querySelector('[data-ficheiro]');
  const estadoCopiaEl = corpo.querySelector('[data-copia-estado]');
  descreverUltimaCopia().then((t) => { estadoCopiaEl.textContent = t; });

  const ficheiroCofre = corpo.querySelector('[data-ficheiro-cofre]');
  corpo.querySelector('[data-copia-abrir]').onclick = () => ficheiroCofre.click();
  ficheiroCofre.onchange = async () => {
    const f = ficheiroCofre.files[0];
    if (!f) return;
    const ok = await abrirCopiaEncriptada(f);
    ficheiroCofre.value = '';
    if (ok) { fecharSheet(); refresh(); }
  };
  corpo.querySelector('[data-copia-exportar]').onclick = () => {
    sheetExportarEncriptada({
      aoGuardar: async () => {
        estadoCopiaEl.textContent = await descreverUltimaCopia();
        refresh();
      },
    });
  };

  corpo.querySelector('[data-imp]').onclick = () => sheetImportar();
  corpo.querySelector('[data-backup]').onclick = async () => {
    const payload = await exportarTudo();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aura-${diaKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    await saveSettings({ ultimaCopia: new Date().toISOString(), copiaAdiada: null });
    estadoCopiaEl.textContent = await descreverUltimaCopia();
    toast('JSON exportado — sem passphrase, legível por qualquer pessoa', 'ok', 5000);
  };
  corpo.querySelector('[data-restore]').onclick = () => { ficheiro.dataset.modo = 'restauro'; ficheiro.click(); };
  ficheiro.onchange = async () => {
    const f = ficheiro.files[0];
    if (!f) return;
    if (/\.zip$/i.test(f.name)) {
      // no iOS é fácil apanhar o Archive.zip em vez do export.xml: um binário
      // não falha com uma mensagem útil, por isso dizemos logo o que fazer.
      toast('Descomprima o Archive.zip na app Ficheiros e escolha o export.xml.', 'err');
      ficheiro.value = '';
      return;
    }
    try {
      if (f.name.endsWith('.json')) {
        const n = await importarTudo(JSON.parse(await f.text()), { substituir: true });
        toast(`Restaurados ${n} registos`);
      } else {
        const r = await importarSaude(await f.text(), f.name);
        toast(`Importados ${r.dias} dias (${r.campos.join(', ') || 'sem campos reconhecidos'})`);
      }
      fecharSheet();
      refresh();
    } catch (e) { toast(e.message || 'Falha na importação', 'err'); }
    ficheiro.value = '';
  };

  corpo.querySelector('[data-exemplo]').onclick = async () => {
    const { semeExemplos } = await import('./seed.js');
    const n = await semeExemplos();
    toast(`Adicionados ${n} registos de exemplo`);
    fecharSheet(); refresh();
  };
  corpo.querySelector('[data-apagar]').onclick = async () => {
    if (!confirm('Apagar todos os registos de saúde? A base de medicação mantém-se.')) return;
    await limparDadosPessoais();
    toast('Registos apagados');
    fecharSheet(); refresh();
  };

  const { root, fechar } = sheet({
    titulo: 'Definições', sub: 'Aura Health Journal', corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Fechar</button>
            <button class="btn btn-primary" data-guardar>Guardar</button>`,
  });
  const fecharSheet = () => { desinscrever(); fechar(); };

  root.querySelector('[data-guardar]').onclick = async () => {
    const btn = root.querySelector('[data-guardar]');
    const escrita = corpo.querySelector('[data-loc]').value.trim();
    let { lat, lon, nome } = escolha;

    // Escreveu uma localidade mas não escolheu a sugestão: guardar o texto
    // novo com as coordenadas antigas daria um clima da cidade errada.
    if (escrita && escrita.toLocaleLowerCase('pt') !== String(nome || '').toLocaleLowerCase('pt')) {
      btn.disabled = true;
      try {
        const r = await geocodar(escrita);
        if (r.length) {
          ({ lat, lon, nome } = r[0]);
          toast(`Localidade: ${nome}`);
        } else {
          nome = s.localidade;
          toast('Localidade não encontrada — coordenadas mantidas', 'warn', 5000);
        }
      } catch {
        nome = s.localidade;
        toast('Sem ligação para confirmar a localidade — coordenadas mantidas', 'warn', 5000);
      } finally {
        btn.disabled = false;
      }
    }

    await saveSettings({
      nome: corpo.querySelector('[data-nome]').value.trim(),
      localidade: nome || escrita || s.localidade,
      lat, lon,
      objetivoAguaMl: +corpo.querySelector('[data-obj]').value || s.objetivoAguaMl,
      incrementoAguaMl: +corpo.querySelector('[data-inc]').value || 250,
      haptics: hap.getAttribute('aria-checked') === 'true',
    });
    toast('Definições guardadas');
    fechar();
    await atualizarClima({ forcar: true, diasAtras: route.tab === 'relatorios' ? 90 : 45 });
    refresh();
  };
}

document.getElementById('btn-settings').addEventListener('click', sheetDefinicoes);

/* ---------------------------------------------------------------- boot --- */

async function arrancar() {
  const s = await settings();
  const inicial = rotaFromHash();
  if (location.hash) { route.tab = inicial.tab; route.sub = inicial.sub; }
  marcarAba();
  await desenhar();
  // num deep link para os relatórios de 90 dias, a série precisa de mais dias
  await atualizarClima({ diasAtras: route.tab === 'relatorios' && +route.sub > 45 ? +route.sub : 45 });

  // Garmin em segundo plano: o módulo já limita a uma tentativa a cada 20 min
  sincronizar({ dias: 7 }).then((r) => { if (r && r.dias) refresh(); }).catch(() => {});

  // clima em segundo plano: atualiza ao voltar para a app e a cada 10 min
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      atualizarClima({ diasAtras: route.tab === 'relatorios' ? 90 : 45 });
      sincronizar({ dias: 3 });
    }
  });
  setInterval(() => {
    if (document.hidden) return;
    // um relatório de 90 dias não pode voltar a ficar com a série de 45
    atualizarClima({ diasAtras: route.tab === 'relatorios' ? 90 : 45 });
  }, 10 * 60 * 1000);

  // instalação: o Chrome expõe beforeinstallprompt; o iOS não tem API nenhuma
  escutarInstalacao(() => { toast('Aura instalado'); refresh(); });

  if ('serviceWorker' in navigator) {    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      // Notificação de atualização: quando há um SW novo à espera, mostrar toast
      const mostrarAtualizacao = () => {
        toast('Nova versão disponível — a atualizar…', 'ok', 4000);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // o novo SW ativou: recarregar para usar a versão nova
          window.location.reload();
        }, { once: true });
        if (reg.waiting) reg.waiting.postMessage('saltar');
      };
      if (reg.waiting) mostrarAtualizacao();
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        if (!novo) return;
        novo.addEventListener('statechange', () => {
          if (novo.state === 'installed' && navigator.serviceWorker.controller) mostrarAtualizacao();
        });
      });
    } catch (e) { console.warn('SW:', e.message); }
  }

  /* Banner offline/online */
  const banner = document.getElementById('offline-banner');
  const atualizarOnline = () => {
    if (banner) banner.hidden = navigator.onLine;
  };
  atualizarOnline();
  window.addEventListener('online', () => { atualizarOnline(); toast('Ligação restabelecida'); });
  window.addEventListener('offline', () => { atualizarOnline(); toast('Sem ligação à internet', 'warn', 4000); });

  /* Pull-to-refresh (iOS PWA não tem nativo) */
  const ptr = document.getElementById('ptr-indicator');
  const ptrText = ptr && ptr.querySelector('.ptr-text');
  let ptrStartY = 0;
  let ptrActive = false;
  let ptrArmed = false;
  const PTR_THRESHOLD = 70;

  if (ptr) {
    view.addEventListener('touchstart', (e) => {
      if (window.scrollY > 0) return;
      ptrStartY = e.touches[0].clientY;
      ptrActive = true;
      ptrArmed = false;
      ptr.classList.remove('armed', 'refreshing');
      if (ptrText) ptrText.textContent = 'Puxar para atualizar';
    }, { passive: true });

    view.addEventListener('touchmove', (e) => {
      if (!ptrActive) return;
      const dy = e.touches[0].clientY - ptrStartY;
      if (dy <= 0) {
        ptr.classList.remove('visible');
        return;
      }
      const pct = Math.min(1, dy / PTR_THRESHOLD);
      ptr.style.transform = `translateX(-50%) translateY(${pct * 60 - 100}%)`;
      ptr.classList.add('visible');
      if (dy >= PTR_THRESHOLD && !ptrArmed) {
        ptrArmed = true;
        ptr.classList.add('armed');
        if (ptrText) ptrText.textContent = 'Largar para atualizar';
        haptic(10);
      } else if (dy < PTR_THRESHOLD && ptrArmed) {
        ptrArmed = false;
        ptr.classList.remove('armed');
        if (ptrText) ptrText.textContent = 'Puxar para atualizar';
      }
    }, { passive: true });

    view.addEventListener('touchend', async () => {
      if (!ptrActive) return;
      ptrActive = false;
      if (!ptrArmed) {
        ptr.classList.remove('visible', 'armed');
        ptr.style.transform = '';
        return;
      }
      ptr.classList.remove('armed');
      ptr.classList.add('refreshing');
      ptr.style.transform = 'translateX(-50%) translateY(0)';
      if (ptrText) ptrText.textContent = 'A atualizar…';
      try {
        await atualizarClima({ forcar: true, diasAtras: route.tab === 'relatorios' ? 90 : 45 });
        await sincronizar({ dias: 7, forcar: true });
        await refresh();
        toast('Dados atualizados');
      } catch (e) { toast('Falha na atualização', 'err'); }
      ptr.classList.remove('visible', 'refreshing');
      ptr.style.transform = '';
      if (ptrText) ptrText.textContent = 'Puxar para atualizar';
    }, { passive: true });
  }
  // à procura de datas por preencher? nada a fazer: o dashboard mostra o dia de hoje.
  void s;
}

subscribe(desenhar);
window.addEventListener('error', (e) => console.error('[aura]', e.message));
arrancar().catch((e) => {
  view.innerHTML = `<div class="card"><h2 class="sheet-title">Não foi possível abrir os dados locais</h2>
    <p class="hint" style="margin-top:8px">${esc(e.message || e)}</p>
    <p class="hint">No iOS, o modo de navegação privada bloqueia o IndexedDB — use uma janela normal.</p></div>`;
});

/* Atalhos globais usados por vários ecrãs */
window.__aura = { go, refresh, sheetCrise, sheetAgua, sheetTomas, sheetDigestivo, isoOf };
