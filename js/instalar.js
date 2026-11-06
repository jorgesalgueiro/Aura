/* ==========================================================================
   instalar.js — levar a app para o ecrã principal (iOS, Android, desktop)
   --------------------------------------------------------------------------
   No iOS só o Safari instala PWAs e só a partir de um endereço HTTPS público;
   não há nenhuma API que dispare a instalação. Por isso a app explica os
   passos em vez de fingir um botão. No Android/desktop o Chrome expõe
   `beforeinstallprompt`, e aí sim há um botão de um toque.
   ========================================================================== */

import { settings, saveSettings } from './store.js';
import { el, sheet, toast, ICON } from './utils.js';

/** Já está a correr a partir do ícone (ecrã inteiro)? */
export const instalada = () =>
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
  // @ts-ignore — propriedade só do iOS
  navigator.standalone === true;

/** 'ios' | 'android' | 'outro'. O iPad moderno disfarça-se de Mac. */
export function plataforma() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'outro';
}

let _prompt = null;

/** Chamar uma vez no arranque. `aoInstalar` corre quando a instalação termina. */
export function escutarInstalacao(aoInstalar) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _prompt = e;
  });
  window.addEventListener('appinstalled', () => {
    _prompt = null;
    if (typeof aoInstalar === 'function') aoInstalar();
  });
}

export const podeInstalarSozinho = () => !!_prompt;

/** Abre o diálogo nativo do Chrome. Devolve 'accepted' | 'dismissed' | null. */
export async function instalacaoNativa() {
  if (!_prompt) return null;
  _prompt.prompt();
  const escolha = await _prompt.userChoice;
  _prompt = null;
  return escolha && escolha.outcome;
}

/** O cartão só aparece no telemóvel, se ainda não estiver instalada nem dispensada. */
export async function deveMostrarCartao() {
  if (instalada()) return false;
  if (plataforma() === 'outro') return false;
  const s = await settings();
  return !s.instalarOculto;
}

export async function dispensarCartao() {
  await saveSettings({ instalarOculto: true });
}

export function cartaoInstalarHTML() {
  const ios = plataforma() === 'ios';
  const dica = ios
    ? 'No Safari: botão Partilhar → Adicionar ao Ecrã Principal.'
    : (podeInstalarSozinho() ? 'Um toque e fica como aplicação.' : 'Menu ⋮ do Chrome → Instalar aplicação.');
  return `
    <div class="card card-accent" data-cartao-instalar>
      <div class="metric-label">Levar consigo</div>
      <div class="row-title" style="font-size:15px">Instalar o Aura</div>
      <div class="row-sub">${dica}</div>
      <div class="btn-row mt12">
        <button class="btn btn-sm btn-primary" data-acao="instalar">Instalar</button>
        <button class="btn btn-sm btn-ghost" data-acao="instalar-dispensar">Agora não</button>
      </div>
    </div>`;
}

export function sheetInstalar() {
  const ios = plataforma() === 'ios';
  const nativo = podeInstalarSozinho();

  const corpo = el(`
    <div>
      <div class="note">
        <b>Não passa por nenhuma loja.</b> A app fica no ecrã principal, abre em ecrã inteiro e
        continua a guardar tudo neste dispositivo. Só precisa de estar num endereço
        <b>https://</b> público — o mesmo que abriu agora.
      </div>

      ${ios ? `
        <div class="section-title mt20">No iPhone / iPad</div>
        <ol class="steps">
          <li>Esta página tem de estar aberta no <b>Safari</b>. O Chrome e o Firefox no iOS
            não instalam aplicações web.</li>
          <li>Toque em <b>Partilhar</b> — o quadrado com a seta para cima, na barra de baixo.</li>
          <li>Deslize a lista e escolha <b>Adicionar ao Ecrã Principal</b>.</li>
          <li>Confirme em <b>Adicionar</b>. O ícone do Aura aparece no ecrã principal.</li>
        </ol>
        <p class="hint mt12">Se não encontrar a opção, remova a página dos separadores em segundo
          plano e abra-a num separador novo: o iOS só mostra “Adicionar ao Ecrã Principal” a
          páginas normais, não a pré-visualizações.</p>` : `
        <div class="section-title mt20">No Android</div>
        <ol class="steps">
          <li>Abra a página no <b>Chrome</b> (ou Edge).</li>
          <li>${nativo
            ? 'Toque em <b>Instalar agora</b>, no fundo desta janela.'
            : 'Abra o menu <b>⋮</b>, no canto superior direito.'}</li>
          <li>${nativo
            ? 'Confirme em <b>Instalar</b>.'
            : 'Escolha <b>Instalar aplicação</b> (ou <i>Adicionar ao ecrã principal</i>).'}</li>
        </ol>`}

      <div class="section-title mt20">No computador</div>
      <p class="hint" style="margin-top:-4px">O Chrome e o Edge mostram um ícone de instalação na
        barra de endereço. Não é obrigatório: a app funciona igual numa aba normal.</p>

      <div class="note mt20">
        <b>Os dados ficam no aparelho.</b> Instalar não envia nada para lado nenhum. Apagar o
        ícone do ecrã principal <b>não</b> apaga os registos — para isso, use
        Definições → Apagar registos. Faça uma cópia em Definições → Exportar cópia de vez em quando.
      </div>
    </div>`);

  const { root, fechar } = sheet({
    titulo: 'Instalar o Aura',
    sub: 'Ecrã principal · sem loja de aplicações',
    corpo,
    acoes: `${nativo ? `<button class="btn btn-primary" data-instalar-agora>${ICON.download} Instalar agora</button>` : ''}
            <button class="btn btn-ghost" data-fechar>Fechar</button>`,
  });

  const btn = root.querySelector('[data-instalar-agora]');
  if (btn) {
    btn.onclick = async () => {
      const r = await instalacaoNativa();
      if (r === 'accepted') { toast('Aura instalado'); fechar(); }
    };
  }
  return fechar;
}
