/* ==========================================================================
   nav.js — rota + re-render (evita ciclos de import entre app.js e ecrãs)
   ========================================================================== */

export const route = { tab: 'dashboard', sub: null };

const subs = new Set();

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function go(tab, sub = null) {
  route.tab = tab;
  route.sub = sub;
  const alvo = `#${sub ? `${tab}/${sub}` : tab}`;
  if (location.hash !== alvo) history.replaceState(null, '', alvo);   // não dispara hashchange
  subs.forEach(f => f());
}

/** Re-renderiza o ecrã atual (após uma gravação de dados). */
export function refresh() { subs.forEach(f => f()); }

const TABS = ['dashboard', 'sintomas', 'farmacia', 'relatorios'];

/** Lê "#tab/sub" — é isto que os atalhos do manifest e o Deep link escrevem. */
export function rotaFromHash() {
  let h = location.hash.slice(1);
  try { h = decodeURIComponent(h); } catch { /* hash malformado: usa o texto cru */ }
  const [tab, ...resto] = h.split('/');
  return {
    tab: TABS.includes(tab) ? tab : 'dashboard',
    sub: resto.length ? resto.join('/') : null,
  };
}
