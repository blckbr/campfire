import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const website = path.join(root, 'website');
const host = '127.0.0.1';
const port = Number(process.env.CAMPFIRE_SITE_PORT || 4173);

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
]);

if (!fs.existsSync(path.join(website, 'index.html'))) {
  console.error(`[ERRO] Site nao encontrado em ${website}`);
  process.exit(1);
}

function safePath(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, `http://${host}:${port}`).pathname);
  } catch {
    return null;
  }

  if (pathname === '/') pathname = '/index.html';
  const candidate = path.resolve(website, `.${pathname}`);
  if (candidate !== website && !candidate.startsWith(website + path.sep)) return null;
  return candidate;
}

const server = http.createServer((req, res) => {
  const requested = safePath(req.url || '/');
  if (!requested) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  let target = requested;
  try {
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.html');
    }
  } catch {}

  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    const fallback = path.join(website, '404.html');
    res.writeHead(404, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(fs.existsSync(fallback) ? fs.readFileSync(fallback) : '<h1>404</h1>');
    return;
  }

  const type = types.get(path.extname(target).toLowerCase()) || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(target).pipe(res);
});

server.listen(port, host, () => {
  console.log('==============================================================');
  console.log(' CAMPFIRE - TESTE LOCAL DO SITE (SERVIDOR ESTATICO)');
  console.log('==============================================================');
  console.log('');
  console.log(` Site: http://${host}:${port}/`);
  console.log('');
  console.log(' Este servidor NAO usa Vite e reproduz o modelo estatico');
  console.log(' usado pela Cloudflare Pages.');
  console.log('');
  console.log(' Pressione Ctrl+C nesta janela para encerrar.');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[ERRO] A porta ${port} ja esta em uso.`);
    console.error('Feche o teste anterior ou defina CAMPFIRE_SITE_PORT com outra porta.');
  } else {
    console.error(error);
  }
  process.exit(1);
});
