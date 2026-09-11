import fs from 'node:fs';
import path from 'node:path';
import { resolveCampfireWebEnv, validateCampfireWebEnv } from './prepare-campfireweb-env.mjs';

const root = process.cwd();
const dist = path.join(root, 'dist');
const indexPath = path.join(dist, 'index.html');
if (!fs.existsSync(indexPath)) throw new Error('dist/index.html nao existe.');

const env = resolveCampfireWebEnv(root, process.env.CAMPFIRE_DESKTOP_SOURCE || 'C:\\messenger');
const check = validateCampfireWebEnv(env);
if (!check.ok) throw new Error('Nao foi possivel validar a configuracao publica usada no build.');

const html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('<div id="root"></div>')) throw new Error('dist/index.html nao contem o root React.');

function collectJavaScriptFiles(directory) {
  const out = [];
  if (!fs.existsSync(directory)) return out;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...collectJavaScriptFiles(absolute));
    else if (entry.isFile() && /\.js$/i.test(entry.name)) out.push(absolute);
  }
  return out;
}

const javascriptFiles = collectJavaScriptFiles(dist);
if (!javascriptFiles.length) throw new Error('Nenhum bundle JavaScript foi encontrado em dist.');
const bundleGraph = javascriptFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

if (!bundleGraph.includes(env.VITE_SUPABASE_URL)) {
  throw new Error('Grafo de bundles Web nao contem VITE_SUPABASE_URL resolvida.');
}
if (!bundleGraph.includes(env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
  throw new Error('Grafo de bundles Web nao contem VITE_SUPABASE_PUBLISHABLE_KEY resolvida.');
}

for (const required of ['_redirects', 'manifest.webmanifest', 'sw.js']) {
  if (!fs.existsSync(path.join(dist, required))) throw new Error(`dist/${required} ausente.`);
}

console.log(`[PASS] Build CampfireWeb contem configuracao publica do Supabase em ${javascriptFiles.length} chunk(s) JavaScript e assets obrigatorios.`);
