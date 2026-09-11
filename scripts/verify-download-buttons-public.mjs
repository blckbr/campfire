const marketingBase = String(process.env.CAMPFIRE_MARKETING_PUBLIC_URL || 'https://campfire-br.pages.dev').replace(/\/$/, '');
const webBase = String(process.env.CAMPFIREWEB_PUBLIC_URL || 'https://campfireweb.pages.dev').replace(/\/$/, '');
const kinds = ['windowsSetup', 'windowsPortable', 'linuxRpm', 'linuxAppImage'];
const labels = ['Windows Setup', 'Windows Portable', 'Linux RPM', 'Linux AppImage'];

async function getText(url) {
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}cfv=${Date.now()}`, {
    headers: { 'cache-control': 'no-cache' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return await response.text();
}

const marketingHtml = await getText(`${marketingBase}/`);
const marketingConfig = await getText(`${marketingBase}/config.js`);
for (const kind of kinds) {
  if (!marketingHtml.includes(`data-download-kind="${kind}"`) && !marketingHtml.includes(`data-download-kind='${kind}'`)) {
    throw new Error(`Marketing sem escolha visivel ${kind}.`);
  }
  if (!marketingConfig.includes(`asset=${kind}`)) throw new Error(`Marketing config sem ${kind}.`);
}
if (!marketingConfig.includes('campfireweb.pages.dev/api/desktop-download')) {
  throw new Error('Marketing nao aponta para o endpoint seguro de download do CampfireWeb.');
}

const root = await getText(`${webBase}/`);
const entrySources = [...root.matchAll(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
if (!entrySources.length) throw new Error('CampfireWeb sem bundle module na raiz.');

const queue = entrySources.map((src) => new URL(src, `${webBase}/`).pathname);
const visited = new Set();
let combined = '';
while (queue.length) {
  const current = queue.shift();
  if (!current || visited.has(current)) continue;
  visited.add(current);
  const text = await getText(`${webBase}${current}`);
  combined += `\n${text}`;
  for (const match of text.matchAll(/["'`](\.?\.?\/[^"'`\s]+\.js(?:\?[^"'`\s]*)?|\/[^"'`\s]+\.js(?:\?[^"'`\s]*)?)["'`]/gi)) {
    try {
      const url = new URL(match[1], `${webBase}${current}`);
      if (url.origin === new URL(webBase).origin && /\.js$/i.test(url.pathname) && !visited.has(url.pathname)) queue.push(url.pathname);
    } catch {}
  }
}
for (const label of labels) {
  if (!combined.includes(label)) throw new Error(`Bundle CampfireWeb sem opcao ${label}.`);
}
if (!combined.includes('/api/desktop-download?asset=')) throw new Error('Bundle CampfireWeb sem endpoint de download.');

for (const kind of kinds) {
  const response = await fetch(`${webBase}/api/desktop-download?asset=${kind}&cfv=${Date.now()}`, {
    redirect: 'manual',
    headers: { 'cache-control': 'no-cache' },
  });
  if (response.status !== 302) throw new Error(`Endpoint ${kind} deveria responder 302, recebeu ${response.status}.`);
  const location = response.headers.get('location') || '';
  if (!/^https:\/\/github\.com\/blckbr\/campfire\/releases(?:\/|$)/i.test(location)) {
    throw new Error(`Endpoint ${kind} redirecionou para destino inesperado: ${location}`);
  }
}

console.log(`[PASS] Downloads publicos validados: 4 opcoes no marketing, 4 no CampfireWeb e 4 redirects seguros.`);
