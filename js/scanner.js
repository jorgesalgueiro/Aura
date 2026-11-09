/* ==========================================================================
   scanner.js — leitura de códigos de barras com a câmara
   --------------------------------------------------------------------------
   Quagga2 (MIT) é carregado só quando o utilizador abre o leitor; fica em
   js/vendor/quagga.min.js e no SHELL do service worker, por isso também
   funciona offline depois da primeira instalação.
   A câmara exige HTTPS (ou localhost). Se falhar — permissão, falta de
   câmara, browser sem suporte — o campo para escrever o código continua
   disponível, e é sempre possível introduzir as calorias à mão.
   ========================================================================== */

import { el, sheet, toast, haptic, ICON } from './utils.js';

let _quagga = null;

function carregarQuagga() {
  if (window.Quagga) return Promise.resolve(window.Quagga);
  if (_quagga) return _quagga;
  _quagga = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/quagga.min.js';
    s.async = true;
    s.onload = () => (window.Quagga ? resolve(window.Quagga) : reject(new Error('O leitor não ficou disponível.')));
    s.onerror = () => { _quagga = null; reject(new Error('Não foi possível carregar o leitor de códigos.')); };
    document.head.appendChild(s);
  });
  return _quagga;
}

/** Pré-carrega o leitor para o primeiro toque na câmara não perder o gesto. */
export function prepararScanner() {
  return carregarQuagga().catch(() => {});
}

/**
 * Abre o leitor. `aoLer(codigo)` é chamado com 8–14 dígitos.
 * Devolve a função de fecho (a folha já foi aberta).
 */
export async function lerCodigo({ aoLer } = {}) {
  const corpo = el(`
    <div>
      <div class="scanner" data-scanner>
        <div class="scanner-video" data-video></div>
        <div class="scanner-mira" aria-hidden="true"></div>
        <div class="scanner-estado" data-estado>a abrir a câmara…</div>
      </div>
      <button class="btn btn-sm btn-ghost btn-block mt8" data-reabrir hidden>Tentar abrir a câmara de novo</button>
      <p class="hint mt12">Aponte a câmara ao código de barras. Se não conseguir, escreva o código em baixo.</p>
      <div class="split mt8" style="gap:8px;align-items:flex-end">
        <label class="fld" style="flex:1;margin:0"><span>Código de barras</span>
          <input type="text" inputmode="numeric" data-codigo placeholder="8 a 14 dígitos" autocomplete="off" spellcheck="false"></label>
        <button class="btn btn-sm" data-usar>Usar</button>
      </div>
    </div>`);

  const estado = corpo.querySelector('[data-estado]');
  const video = corpo.querySelector('[data-video]');
  const input = corpo.querySelector('[data-codigo]');
  const reabrir = corpo.querySelector('[data-reabrir]');
  let quagga = null;
  let handler = null;
  let fechado = false;
  let ultimo = '';
  let ultimoTs = 0;
  let fechar = () => {};

  const parar = () => {
    if (fechado) return;
    fechado = true;
    try { if (quagga && handler) quagga.offDetected(handler); } catch { /* ignorado */ }
    try { if (quagga) quagga.stop(); } catch { /* ignorado */ }
    try { if (quagga && quagga.CameraAccess) quagga.CameraAccess.release(); } catch { /* ignorado */ }
    try { video.innerHTML = ''; } catch { /* ignorado */ }
  };

  const usar = (bruto) => {
    const codigo = String(bruto || '').replace(/\D/g, '');
    if (codigo.length < 8 || codigo.length > 14) {
      toast('Código inválido: use 8 a 14 dígitos.', 'err');
      input.focus();
      return;
    }
    parar();
    fechar();
    if (typeof aoLer === 'function') aoLer(codigo);
  };

  const s = sheet({
    titulo: 'Ler código de barras',
    sub: 'Câmara traseira · ou escreva o código',
    corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Fechar</button>`,
    autoFocus: false,
    aoFechar: parar,
  });
  fechar = s.fechar;

  const usarBtn = corpo.querySelector('[data-usar]');
  usarBtn.onclick = () => usar(input.value);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); usar(input.value); }
  });

  async function iniciarCamera() {
    if (fechado) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      estado.textContent = 'A câmara só funciona em HTTPS ou localhost. Escreva o código em baixo.';
      estado.classList.add('erro');
      return;
    }
    reabrir.hidden = true;
    estado.textContent = 'a abrir a câmara…';
    estado.classList.remove('erro');

    try {
      try { if (quagga && handler) quagga.offDetected(handler); } catch { /* ignorado */ }
      try { if (quagga) quagga.stop(); } catch { /* ignorado */ }
      try { video.innerHTML = ''; } catch { /* ignorado */ }
      handler = null;

      quagga = await carregarQuagga();
      if (fechado) {
        try { quagga.stop(); } catch { /* ignorado */ }
        return;
      }

      await new Promise((resolve, reject) => {
        quagga.init({
          inputStream: {
            name: 'Live',
            type: 'LiveStream',
            target: video,
            constraints: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          locator: { patchSize: 'medium', halfSample: true },
          numOfWorkers: Math.min(2, navigator.hardwareConcurrency || 2),
          frequency: 10,
          decoder: {
            readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader', 'code_128_reader'],
          },
          locate: true,
          area: { top: '18%', right: '4%', left: '4%', bottom: '18%' },
        }, (err) => (err ? reject(err) : resolve()));
      });

      if (fechado) {
        try { quagga.stop(); } catch { /* ignorado */ }
        return;
      }

      const elVideo = video.querySelector('video');
      if (elVideo) {
        elVideo.setAttribute('playsinline', '');
        elVideo.muted = true;
      }

      handler = (res) => {
        const codigo = res && res.codeResult && res.codeResult.code;
        if (!codigo) return;
        const agora = Date.now();
        if (codigo === ultimo && agora - ultimoTs < 1500) return;
        ultimo = codigo;
        ultimoTs = agora;
        haptic([12, 40, 12]);
        usar(codigo);
      };
      quagga.onDetected(handler);
      quagga.start();
      estado.textContent = 'Aponte ao código de barras';
      estado.classList.remove('erro');
    } catch (e) {
      const msg = e && e.name === 'NotAllowedError'
        ? 'Permissão da câmara recusada. Autorize nas definições do browser e tente de novo, ou escreva o código em baixo.'
        : e && e.name === 'NotFoundError'
          ? 'Não encontrámos uma câmara neste dispositivo. Escreva o código em baixo.'
          : e && e.name === 'NotReadableError'
            ? 'A câmara está ocupada por outra aplicação. Feche-a e tente de novo.'
            : 'Não foi possível abrir a câmara. Tente de novo ou escreva o código em baixo.';
      estado.textContent = msg;
      estado.classList.add('erro');
      reabrir.hidden = false;
      try { if (quagga) quagga.stop(); } catch { /* ignorado */ }
    }
  }

  reabrir.onclick = () => { iniciarCamera(); };
  iniciarCamera();

  return s.fechar;
}
