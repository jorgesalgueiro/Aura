/**
 * tools/empacotar.mjs — constrói os pacotes de publicação do Aura
 * -------------------------------------------------------------------------
 * Sem dependências: escreve o ZIP e o TAR.GZ à mão (zlib do Node + CRC32).
 *
 *   node tools/empacotar.mjs
 *
 * Produz:
 *   dist/site/                 pasta pronta a publicar (Netlify, Pages, nginx…)
 *   dist/aura-<versao>.zip     para arrastar para um hosting estático
 *   dist/aura-<versao>.tar.gz  para um servidor / imagem Docker
 *
 * A versão vem do `VERSAO` do service worker, para o pacote e a cache
 * contarem sempre a mesma história.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');
const SITE = path.join(DIST, 'site');

/* ------------------------------------------------------------- inventário */

const INCLUIR = ['index.html', 'manifest.webmanifest', 'sw.js', 'styles', 'js', 'assets'];

const listar = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return listar(full, base);
  return [path.relative(base, full).split(path.sep).join('/')];
});

function versao() {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const m = sw.match(/const\s+VERSAO\s*=\s*'([^']+)'/);
  return m ? m[1] : 'aura-dev';
}

/** Confirma que tudo o que o service worker promete existe mesmo. */
function verificarShell() {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const bloco = sw.match(/const\s+SHELL\s*=\s*\[([\s\S]*?)\];/);
  if (!bloco) return [];
  const caminhos = [...bloco[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return caminhos.filter((c) => {
    const alvo = c === './' ? path.join(RAIZ, 'index.html') : path.join(RAIZ, c);
    return !fs.existsSync(alvo);
  });
}

/* ---------------------------------------------------------------- CRC32 --- */

const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ ZIP --- */

function dosData(d) {
  return {
    hora: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() >> 1) & 31),
    data: (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31),
  };
}

function zipar(ficheiros) {
  const partes = [];
  const central = [];
  const { hora, data } = dosData(new Date());
  let offset = 0;

  for (const f of ficheiros) {
    const nome = Buffer.from(f.nome, 'utf8');
    const comprimido = zlib.deflateRawSync(f.dados, { level: 9 });
    const crc = crc32(f.dados);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // versão necessária
    local.writeUInt16LE(0x0800, 6);      // nomes em UTF-8
    local.writeUInt16LE(8, 8);           // deflate
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(f.dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);

    partes.push(local, nome, comprimido);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);            // criado por
    cen.writeUInt16LE(20, 6);            // versão necessária
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(hora, 12);
    cen.writeUInt16LE(data, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comprimido.length, 20);
    cen.writeUInt32LE(f.dados.length, 24);
    cen.writeUInt16LE(nome.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nome);

    offset += local.length + nome.length + comprimido.length;
  }

  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(ficheiros.length, 8);
  eocd.writeUInt16LE(ficheiros.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...partes, cd, eocd]);
}

/* ------------------------------------------------------------------ TAR --- */

function octal(valor, tamanho) {
  return valor.toString(8).padStart(tamanho - 1, '0') + '\0';
}

function tar(ficheiros) {
  const blocos = [];
  const mtime = octal(Math.floor(Date.now() / 1000), 12);

  for (const f of ficheiros) {
    const cab = Buffer.alloc(512);
    Buffer.from(f.nome, 'utf8').copy(cab, 0, 0, 100);
    cab.write('0000644\0', 100, 'ascii');
    cab.write('0000000\0', 108, 'ascii');
    cab.write('0000000\0', 116, 'ascii');
    cab.write(octal(f.dados.length, 12), 124, 'ascii');
    cab.write(mtime, 136, 'ascii');
    cab.write('        ', 148, 'ascii');   // checksum por calcular
    cab.write('0', 156, 'ascii');          // ficheiro normal
    cab.write('ustar\0', 257, 'ascii');
    cab.write('00', 263, 'ascii');
    cab.write('root', 265, 'ascii');
    cab.write('root', 297, 'ascii');

    let soma = 0;
    for (const b of cab) soma += b;
    cab.write(octal(soma, 7) + ' ', 148, 'ascii');

    blocos.push(cab, f.dados);
    const resto = f.dados.length % 512;
    if (resto) blocos.push(Buffer.alloc(512 - resto));
  }
  blocos.push(Buffer.alloc(1024));   // fim do arquivo
  return Buffer.concat(blocos);
}

/* ------------------------------------------------------------------ build -- */

const kb = (n) => `${(n / 1024).toFixed(n > 1024 * 1000 ? 0 : 1)} kB`;

/** Build anterior, se existir — serve para avisar quando falta subir o VERSAO. */
function lerBuildAnterior() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIST, 'BUILD.json'), 'utf8'));
  } catch {
    return null;
  }
}

const anterior = lerBuildAnterior();

const faltam = verificarShell();
if (faltam.length) {
  console.error('O service worker lista ficheiros que não existem:');
  for (const f of faltam) console.error('  ·', f);
  process.exit(1);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(SITE, { recursive: true });

const nomes = INCLUIR.flatMap((entrada) => {
  const full = path.join(RAIZ, entrada);
  if (!fs.existsSync(full)) return [];
  return fs.statSync(full).isDirectory() ? listar(full).map((r) => `${entrada}/${r}`) : [entrada];
}).sort();

const ficheiros = nomes.map((nome) => {
  const dados = fs.readFileSync(path.join(RAIZ, nome));
  const destino = path.join(SITE, nome);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, dados);
  return { nome, dados };
});

const v = versao();
const zip = zipar(ficheiros);
const tgz = zlib.gzipSync(tar(ficheiros), { level: 9 });
fs.writeFileSync(path.join(DIST, `${v}.zip`), zip);
fs.writeFileSync(path.join(DIST, `${v}.tar.gz`), tgz);

const total = ficheiros.reduce((a, f) => a + f.dados.length, 0);
const linha = (rotulo, extra) => `  ${rotulo.padEnd(26)}${extra}`;

const resumo = crypto.createHash('sha256');
for (const f of ficheiros) { resumo.update(f.nome); resumo.update(f.dados); }
const impressao = resumo.digest('hex').slice(0, 12);

fs.writeFileSync(
  path.join(DIST, 'BUILD.json'),
  JSON.stringify({ versao: v, hash: impressao, ficheiros: ficheiros.length, em: new Date().toISOString() }, null, 2) + '\n',
);

console.log(`\nAura Health Journal · ${v}`);
console.log(`  ${ficheiros.length} ficheiros · ${kb(total)} descomprimidos · build ${impressao}\n`);
console.log(linha('dist/site/', 'pasta pronta a publicar'));
console.log(linha(`dist/${v}.zip`, `${kb(zip.length)}  · arrastar para um hosting`));
console.log(linha(`dist/${v}.tar.gz`, `${kb(tgz.length)}  · servidor ou Docker`));
console.log('\nPublicar e instalar no iPhone: README.md → "Publicar e instalar".\n');

if (anterior && anterior.versao === v && anterior.hash !== impressao) {
  console.warn(`⚠  Os ficheiros mudaram mas o VERSAO continua ${v}.`);
  console.warn('   Quem já tem a app instalada não recebe esta alteração — avance o VERSAO em sw.js.\n');
} else if (anterior && anterior.versao !== v) {
  console.log(`Versão ${anterior.versao} → ${v}: quem tem a app instalada vai receber a atualização.\n`);
}
