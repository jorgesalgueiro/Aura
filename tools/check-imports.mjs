/**
 * tools/check-imports.mjs — deteta símbolos usados num módulo mas não importados.
 * Comparação textual conservativa: só assina quando o nome aparece como chamada
 * ou acesso e não consta da lista de importações do ficheiro.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'js');

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const ficheiros = walk(RAIZ).filter((f) => f.endsWith('.js'));

/** nomes exportados por cada módulo */
const exportados = new Map();
for (const f of ficheiros) {
  const t = fs.readFileSync(f, 'utf8');
  const nomes = new Set();
  for (const m of t.matchAll(/^export\s+(?:async\s+)?(?:function|class)\s+([\w$]+)/gm)) nomes.add(m[1]);
  for (const m of t.matchAll(/^export\s+(?:const|let|var)\s+([\w$]+)/gm)) nomes.add(m[1]);
  for (const m of t.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const parte of m[1].split(',')) {
      const alvo = parte.trim().split(/\s+as\s+/).pop().trim();
      if (alvo) nomes.add(alvo);
    }
  }
  exportados.set(path.resolve(f), nomes);
}

let problemas = 0;
for (const f of ficheiros) {
  const t = fs.readFileSync(f, 'utf8');
  const importados = new Set();
  for (const m of t.matchAll(/import\s*(?:\{([^}]*)\}\s*from|([\w$]+)\s+from|\*\s+as\s+([\w$]+)\s+from)\s*['"][^'"]+['"]/g)) {
    if (m[1]) for (const p of m[1].split(',')) {
      const n = p.trim().split(/\s+as\s+/).pop().trim();
      if (n) importados.add(n);
    }
    if (m[2]) importados.add(m[2]);
    if (m[3]) importados.add(m[3]);
  }
  // nomes declarados localmente
  const locais = new Set();
  for (const m of t.matchAll(/^\s*(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([\w$]+)/gm)) locais.add(m[1]);
  for (const m of t.matchAll(/import\s*\{([^}]*)\}\s*from/g)) for (const p of m[1].split(',')) locais.add(p.trim().split(/\s+as\s+/).pop().trim());
  // importações dinâmicas: const { a, b } = await import('./x.js')
  for (const m of t.matchAll(/const\s*\{([^}]*)\}\s*=\s*(?:await\s+)?import\(/g))
    for (const p of m[1].split(',')) locais.add(p.trim().split(/\s+as\s+/).pop().trim());

  // texto sem comentários, para não assinalar prosa
  const codigo = t
    .replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, '');
  const linhas = codigo.split('\n');

  // candidatos: tudo o que algum módulo exporta
  const todos = new Set([...exportados.values()].flatMap((s) => [...s]));
  for (const nome of todos) {
    if (importados.has(nome) || locais.has(nome)) continue;
    const re = new RegExp(`(?<![\\w$.])${nome.replace(/\$/g, '\\$')}\\s*\\(`, 'g');
    for (let i = 0; i < linhas.length; i++) {
      if (/^\s*(?:import|export)\b/.test(linhas[i])) continue;
      re.lastIndex = 0;
      let m;
      let assinalado = false;
      while ((m = re.exec(linhas[i]))) {
        // prosa dentro de templates: "${x} dias (…)" / "${n} linha(s)"
        if (linhas[i].slice(0, m.index).trimEnd().endsWith('}')) continue;
        console.log(`${path.relative(RAIZ, f)}:${i + 1}  usa "${nome}" sem o importar`);
        problemas++; assinalado = true; break;
      }
      if (assinalado) break;
    }
  }
}
console.log(problemas ? `\n${problemas} problema(s)` : '\nimportações coerentes em todos os módulos');
process.exit(problemas ? 1 : 0);
