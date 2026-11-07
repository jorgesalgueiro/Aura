/* ==========================================================================
   cofre.js — cópia de segurança encriptada (.aura) e lembrete de cópia
   --------------------------------------------------------------------------
   O JSON simples é prático mas fica legível por qualquer pessoa. Este módulo
   cria um ficheiro que só abre com uma passphrase escrita pelo utilizador:
   PBKDF2-SHA256 (600 000 iterações) para derivar a chave, AES-256-GCM para
   cifrar. A passphrase nunca é guardada — se se perder, o ficheiro morre com
   ela. É esse o preço de a cifra ser real.

   Formato do ficheiro (JSON, extensão .aura):
     { app, formato, versao, criadoEm,
       kdf:   { nome, iteracoes, salt },
       cifra: { nome, iv },
       dados: base64(AES-GCM(payload)) }
   O cabeçalho entra como additionalData: mudar iterações, salt ou versão
   invalida a decifra em vez de produzir lixo.
   ========================================================================== */

import {
  exportarTudo, importarTudo, settings, saveSettings, diasComDados, dias, diaKey,
} from './store.js';
import { el, esc, sheet, toast, haptic, ICON, fmt } from './utils.js';
import { refresh } from './nav.js';

const FORMATO = 'aura-cofre';
const VERSAO = 1;
const ITERACOES = 600000;
const MIN_PASS = 8;
const DIAS_AVISO = 14;      // dias sem cópia até aparecer o lembrete
const DIAS_ADIAR = 7;       // "agora não" esconde o aviso por uma semana

const texto = new TextEncoder();

/* --------------------------------------------------------------- base64 -- */

const b64 = (buf) => {
  const u8 = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < u8.length; i += 0x8000) {
    out += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  }
  return btoa(out);
};

const deB64 = (s) => {
  const bin = atob(String(s || ''));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};

/* ------------------------------------------------------------------ cifra */

const normalizar = (pass) => String(pass || '').normalize('NFKC').trim();

const adicionais = (saltB64, iteracoes) =>
  texto.encode(`${FORMATO}|${VERSAO}|PBKDF2-SHA256|${iteracoes}|${saltB64}`);

async function derivar(passphrase, salt, iteracoes) {
  const base = await crypto.subtle.importKey(
    'raw', texto.encode(normalizar(passphrase)), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iteracoes, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/** Devolve o texto do ficheiro .aura a partir de um payload de exportarTudo(). */
export async function cifrarCopia(payload, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const saltB64 = b64(salt);
  const chave = await derivar(passphrase, salt, ITERACOES);
  const claro = texto.encode(JSON.stringify(payload));
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: adicionais(saltB64, ITERACOES) },
    chave, claro,
  );
  return JSON.stringify({
    app: 'Aura Health Journal',
    formato: FORMATO,
    versao: VERSAO,
    criadoEm: new Date().toISOString(),
    kdf: { nome: 'PBKDF2-SHA256', iteracoes: ITERACOES, salt: saltB64 },
    cifra: { nome: 'AES-GCM-256', iv: b64(iv) },
    dados: b64(cifrado),
  }, null, 2);
}

/** Lê um .aura e devolve o payload. Lança Error com mensagem para o utilizador. */
export async function decifrarCopia(arquivo, passphrase) {
  let c;
  try { c = JSON.parse(arquivo); } catch { throw new Error('Isto não parece um ficheiro do Aura.'); }
  if (!c || c.formato !== FORMATO) throw new Error('Isto não é uma cópia encriptada do Aura.');
  if (Number(c.versao) > VERSAO) throw new Error('Esta cópia foi criada por uma versão mais recente da app.');

  const iteracoes = Number(c.kdf && c.kdf.iteracoes);
  if (!(iteracoes >= 100000 && iteracoes <= 2000000)) throw new Error('Parâmetros de cifra inválidos.');
  if (!c.kdf.salt || !c.cifra || !c.cifra.iv || !c.dados) throw new Error('Cópia incompleta.');

  let payload;
  try {
    const chave = await derivar(passphrase, deB64(c.kdf.salt), iteracoes);
    const claro = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: deB64(c.cifra.iv), additionalData: adicionais(c.kdf.salt, iteracoes) },
      chave, deB64(c.dados),
    );
    payload = JSON.parse(new TextDecoder().decode(claro));
  } catch {
    throw new Error('Passphrase errada ou ficheiro alterado.');
  }

  if (!payload || !payload.dados) throw new Error('A cópia não tem dados.');
  return payload;
}

/* ------------------------------------------------------- estado da cópia */

export const ehCopiaEncriptada = (arquivo) => {
  try { return JSON.parse(arquivo).formato === FORMATO; } catch { return false; }
};

/** { ultima: Date|null, dias: number|null } */
export async function estadoCopia() {
  const s = await settings();
  if (!s.ultimaCopia) return { ultima: null, dias: null };
  const ultima = new Date(s.ultimaCopia);
  if (Number.isNaN(+ultima)) return { ultima: null, dias: null };
  const dias = Math.floor((Date.now() - +ultima) / 864e5);
  return { ultima, dias };
}

export async function descreverUltimaCopia() {
  const { ultima, dias } = await estadoCopia();
  if (!ultima) return 'Ainda não guardaste nenhuma cópia.';
  if (dias <= 0) return 'Última cópia: hoje.';
  if (dias === 1) return 'Última cópia: ontem.';
  return `Última cópia: há ${fmt(dias)} dias.`;
}

/** O aviso só aparece a quem já tem o que perder. */
export async function precisaCopia() {
  const s = await settings();
  if (s.copiaAdiada && new Date(s.copiaAdiada) > new Date()) return false;
  const { ultima, dias: desde } = await estadoCopia();
  if (ultima && desde < DIAS_AVISO) return false;
  const comDados = await diasComDados(dias(30));
  return comDados.length >= 2;
}

export async function adiarAvisoCopia() {
  const d = new Date();
  d.setDate(d.getDate() + DIAS_ADIAR);
  await saveSettings({ copiaAdiada: d.toISOString() });
}

export function cartaoCopiaHTML({ dias = null } = {}) {
  const titulo = dias == null ? 'Ainda não tens nenhuma cópia' : `A última cópia foi há ${fmt(dias)} dia${dias === 1 ? '' : 's'}`;
  return `
    <div class="card">
      <div class="split" style="align-items:flex-start">
        <div>
          <div class="metric-label">Cópia de segurança</div>
          <div class="row-title" style="font-size:15px">${esc(titulo)}</div>
          <div class="row-sub">O diário vive só neste browser. Uma cópia encriptada sobrevive a
            limpar os dados do Safari — e ninguém a abre sem a passphrase.</div>
        </div>
        <span class="metric-icon amber">${ICON.download}</span>
      </div>
      <div class="btn-row mt12">
        <button class="btn btn-sm btn-primary" data-acao="copia">Fazer cópia</button>
        <button class="btn btn-sm btn-ghost" data-acao="copia-adiar">Agora não</button>
      </div>
    </div>`;
}

/* ------------------------------------------------------------- exportar -- */

function descarregar(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 6000);
}

/** Folha: pedir passphrase, cifrar e entregar o ficheiro. */
export async function sheetExportarEncriptada({ aoGuardar } = {}) {
  const corpo = el(`
    <div>
      <div class="note">
        <b>Uma passphrase, um ficheiro.</b> A cópia sai cifrada com AES-256 e só abre com a
        passphrase que escreveres aqui. <b>Não há recuperação</b>: sem ela, o ficheiro é lixo —
        nem a app nem ninguém o consegue abrir.
      </div>
      <label class="fld mt16"><span>Passphrase</span>
        <input type="password" data-p1 autocomplete="new-password" spellcheck="false"
          placeholder="pelo menos ${MIN_PASS} caracteres"></label>
      <label class="fld"><span>Repetir a passphrase</span>
        <input type="password" data-p2 autocomplete="new-password" spellcheck="false"></label>
      <p class="hint" data-estado>Uma frase de quatro palavras é mais fácil de lembrar e mais
        difícil de adivinhar do que uma palavra curta com símbolos.</p>
    </div>`);

  const { root, fechar } = sheet({
    titulo: 'Cópia encriptada',
    sub: 'ficheiro .aura · só abre com a passphrase',
    corpo,
    acoes: `<button class="btn btn-ghost" data-fechar>Cancelar</button>
            <button class="btn btn-primary" data-criar>${ICON.download} Criar cópia</button>`,
  });

  const estado = corpo.querySelector('[data-estado]');
  const p1 = corpo.querySelector('[data-p1]');
  const p2 = corpo.querySelector('[data-p2]');
  const criar = root.querySelector('[data-criar]');
  p1.focus();

  criar.onclick = async () => {
    const pass = normalizar(p1.value);
    if (pass.length < MIN_PASS) { toast(`A passphrase precisa de ${MIN_PASS} caracteres`, 'err'); p1.focus(); return; }
    if (pass !== normalizar(p2.value)) { toast('As passphrases não são iguais', 'err'); p2.focus(); return; }

    criar.disabled = true;
    criar.textContent = 'a preparar…';
    estado.textContent = 'A reunir os dados…';
    try {
      const payload = await exportarTudo();
      estado.textContent = 'A cifrar… (as passphrases lentas são de propósito)';
      const arquivo = await cifrarCopia(payload, pass);

      const nome = `aura-${diaKey()}.aura`;
      const blob = new Blob([arquivo], { type: 'application/octet-stream' });
      await saveSettings({ ultimaCopia: new Date().toISOString(), copiaAdiada: null });
      haptic([10, 40, 10]);
      descarregar(blob, nome);
      fechar();
      if (typeof aoGuardar === 'function') aoGuardar();
      prontoParaGuardar({ blob, nome, bytes: arquivo.length });
    } catch (e) {
      estado.textContent = e.message || 'Falha ao criar a cópia.';
      criar.disabled = false;
      criar.innerHTML = `${ICON.download} Criar cópia`;
    }
  };

  return fechar;
}

/** Folha depois de cifrar: partilhar para Ficheiros (iOS) ou descarregar outra vez. */
function prontoParaGuardar({ blob, nome, bytes }) {
  const ficheiro = typeof File === 'function' ? new File([blob], nome, { type: 'application/octet-stream' }) : null;
  const podePartilhar = !!(ficheiro && navigator.canShare && navigator.canShare({ files: [ficheiro] }));

  const corpo = el(`
    <div>
      <div class="note">
        <b>Cópia criada.</b> ${esc(nome)} · ${fmt(bytes / 1024)} kB.
        O ficheiro não fica dentro da app — guarda-o na pasta <b>Aura</b> (ou no Drive/iCloud),
        senão perde-se ao fechar.
      </div>
      <p class="hint mt12">No iPhone, usa <b>Guardar em Ficheiros</b> e escolhe a pasta onde
        queres o ficheiro. Sem a passphrase ninguém o abre — guarda-a fora do telemóvel.</p>
    </div>`);

  const acoes = `
    ${podePartilhar ? `<button class="btn btn-primary" data-partilhar>${ICON.share} Guardar em Ficheiros…</button>` : ''}
    <button class="btn ${podePartilhar ? 'btn-ghost' : 'btn-primary'}" data-baixar>${ICON.download} Descarregar</button>
    <button class="btn btn-ghost" data-fechar>Fechar</button>`;

  const { root } = sheet({
    titulo: 'Cópia encriptada pronta',
    sub: podePartilhar ? 'guarda-a fora da app' : 'ficheiro descarregado',
    corpo,
    acoes,
  });

  const baixar = root.querySelector('[data-baixar]');
  if (baixar) baixar.onclick = () => descarregar(blob, nome);

  const partilhar = root.querySelector('[data-partilhar]');
  if (partilhar) {
    partilhar.onclick = async () => {
      try {
        await navigator.share({ files: [ficheiro], title: 'Aura — cópia encriptada' });
      } catch (e) {
        if (!e || e.name !== 'AbortError') toast('Não foi possível partilhar', 'err');
      }
    };
  }
}

/* -------------------------------------------------------------- restaurar */

function pedirPassphrase(nome, erro = '') {
  return new Promise((resolve) => {
    let resolvido = false;
    const corpo = el(`
      <div>
        <div class="note">
          <b>${esc(nome)}</b><br>
          É preciso a passphrase que foi usada quando esta cópia foi criada.
        </div>
        <label class="fld mt16"><span>Passphrase</span>
          <input type="password" data-p1 autocomplete="current-password" spellcheck="false"></label>
        <p class="hint" data-estado>${esc(erro)}</p>
      </div>`);

    const { root, fechar } = sheet({
      titulo: 'Abrir cópia encriptada',
      sub: 'a passphrase não fica guardada',
      corpo,
      acoes: `<button class="btn btn-ghost" data-fechar>Cancelar</button>
              <button class="btn btn-primary" data-abrir>Abrir</button>`,
      aoFechar: () => { if (!resolvido) { resolvido = true; resolve(null); } },
    });

    const input = corpo.querySelector('[data-p1]');
    const abrir = root.querySelector('[data-abrir]');
    input.focus();

    const terminar = (valor) => {
      if (resolvido) return;
      resolvido = true;
      resolve(valor);
      fechar();
    };

    abrir.onclick = () => {
      const pass = normalizar(input.value);
      if (!pass) { input.focus(); return; }
      terminar(pass);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir.click(); });
  });
}

/**
 * Restaura um ficheiro .aura escolhido pelo utilizador.
 * Devolve true se os dados foram substituídos.
 */
export async function abrirCopiaEncriptada(file) {
  let arquivo;
  try { arquivo = await file.text(); } catch { toast('Não foi possível ler o ficheiro', 'err'); return false; }

  if (!ehCopiaEncriptada(arquivo)) {
    toast('Escolhe um ficheiro .aura (cópia encriptada).', 'err', 5000);
    return false;
  }

  let payload;
  let erro = '';
  while (!payload) {
    const pass = await pedirPassphrase(file.name || 'cópia .aura', erro);
    if (!pass) return false;
    try {
      payload = await decifrarCopia(arquivo, pass);
    } catch (e) {
      erro = e.message || 'Passphrase errada.';
      toast(erro, 'err', 6000);
    }
  }

  const n = Object.values(payload.dados || {})
    .reduce((a, linhas) => a + (Array.isArray(linhas) ? linhas.length : 0), 0);

  if (!confirm(`Substituir os dados deste aparelho pela cópia (${n} registos)?\n\nOs registos atuais são apagados. A lista de medicação da cópia também substitui a atual.`)) {
    return false;
  }

  try {
    const gravados = await importarTudo(payload, { substituir: true });
    await saveSettings({ ultimaCopia: new Date().toISOString(), copiaAdiada: null });
    haptic([10, 40, 10]);
    toast(`${gravados} registos restaurados`);
    refresh();
    return true;
  } catch (e) {
    toast(e.message || 'Falha ao restaurar', 'err', 6000);
    return false;
  }
}
