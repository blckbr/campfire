import { resolveCampfireWebEnv, validateCampfireWebEnv } from './prepare-campfireweb-env.mjs';

const base = String(process.env.CAMPFIREWEB_PUBLIC_URL || 'https://campfireweb.pages.dev').replace(/\/$/, '');
const env = resolveCampfireWebEnv(process.cwd(), process.env.CAMPFIRE_DESKTOP_SOURCE || 'C:\\messenger');
const check = validateCampfireWebEnv(env);
if (!check.ok) throw new Error('Configuracao local indisponivel para comparar com a publicacao.');

async function get(pathname) {
  const join = pathname.includes('?') ? '&' : '?';
  const response = await fetch(`${base}${pathname}${join}cfv=${Date.now()}`, {
    redirect: 'follow',
    headers: { 'cache-control': 'no-cache' },
  });
  if (!response.ok) throw new Error(`${pathname} HTTP ${response.status}`);
  return { response, text: await response.text() };
}

function referencedJavaScript(text, currentPath) {
  const refs = new Set();
  const pattern = /["'`](\.?\.?\/[^"'`\s]+\.js(?:\?[^"'`\s]*)?|\/[^"'`\s]+\.js(?:\?[^"'`\s]*)?)["'`]/gi;
  for (const match of text.matchAll(pattern)) {
    try {
      const resolved = new URL(match[1], `${base}${currentPath}`);
      if (resolved.origin === new URL(base).origin && /\.js$/i.test(resolved.pathname)) {
        refs.add(resolved.pathname);
      }
    } catch {
      // Ignore malformed or non-URL chunk hints; only same-origin JS dependencies are relevant.
    }
  }
  return [...refs];
}

async function crawlJavaScriptGraph(entryPaths) {
  const queue = [...new Set(entryPaths)];
  const visited = new Set();
  let combined = '';

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const resource = await get(current);
    combined += `\n${resource.text}`;
    for (const dependency of referencedJavaScript(resource.text, current)) {
      if (!visited.has(dependency)) queue.push(dependency);
    }
  }

  return { combined, visited };
}

const root = await get('/');
if (!root.text.includes('<div id="root"></div>')) throw new Error('Raiz publica nao contem o root React.');

const app = await get('/app/');
if (!app.text.includes('<div id="root"></div>')) throw new Error('/app/ publica nao contem o root React.');

const moduleSources = [...root.text.matchAll(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/gi)].map((match) => match[1]);
if (!moduleSources.length) throw new Error('Bundle module nao referenciado na raiz publica.');

const entryPaths = moduleSources.map((source) => {
  const resolved = new URL(source, `${base}/`);
  return resolved.pathname;
});
const graph = await crawlJavaScriptGraph(entryPaths);

if (!graph.combined.includes(env.VITE_SUPABASE_URL)) {
  throw new Error('Grafo de bundles publico nao contem a URL Supabase esperada.');
}
if (!graph.combined.includes(env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
  throw new Error('Grafo de bundles publico nao contem a chave publicavel Supabase esperada.');
}

console.log(`[PASS] CampfireWeb publico responde em / e /app/ e ${graph.visited.size} chunk(s) publicados contem a configuracao Supabase esperada.`);
