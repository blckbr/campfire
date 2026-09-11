import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_PUBLIC_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
];

const PUBLIC_KEYS = [
  ...REQUIRED_PUBLIC_KEYS,
  'VITE_CAMPFIRE_MEDIA_TRANSPORT',
  'VITE_CAMPFIRE_NEWS_IMAGE_ENDPOINT',
];

function unquote(value) {
  const text = String(value ?? '').trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1);
  }
  return text;
}

export function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = normalized.indexOf('=');
    if (eq <= 0) continue;
    const key = normalized.slice(0, eq).trim();
    if (!/^[A-Z0-9_]+$/i.test(key)) continue;
    out[key] = unquote(normalized.slice(eq + 1));
  }
  return out;
}

function loadViteStyleEnv(root) {
  const merged = {};
  for (const name of ['.env', '.env.local', '.env.web', '.env.web.local']) {
    Object.assign(merged, parseEnvFile(path.join(root, name)));
  }
  return merged;
}

export function resolveCampfireWebEnv(root = process.cwd(), sourceRoot = process.env.CAMPFIRE_DESKTOP_SOURCE || 'C:\\messenger') {
  const current = loadViteStyleEnv(root);
  const processPublic = Object.fromEntries(
    PUBLIC_KEYS.filter((key) => process.env[key]).map((key) => [key, process.env[key]])
  );
  Object.assign(current, processPublic);

  const missing = REQUIRED_PUBLIC_KEYS.filter((key) => !current[key]);
  if (missing.length && sourceRoot) {
    const source = loadViteStyleEnv(path.resolve(sourceRoot));
    for (const key of PUBLIC_KEYS) {
      if (!current[key] && source[key]) current[key] = source[key];
    }
  }

  if (!current.VITE_CAMPFIRE_MEDIA_TRANSPORT) {
    current.VITE_CAMPFIRE_MEDIA_TRANSPORT = 'livekit';
  }

  return current;
}

export function validateCampfireWebEnv(env) {
  const missing = REQUIRED_PUBLIC_KEYS.filter((key) => !env[key]);
  if (missing.length) return { ok: false, missing };
  try {
    const url = new URL(env.VITE_SUPABASE_URL);
    if (url.protocol !== 'https:') return { ok: false, missing: [], reason: 'VITE_SUPABASE_URL precisa usar HTTPS.' };
  } catch {
    return { ok: false, missing: [], reason: 'VITE_SUPABASE_URL nao e uma URL valida.' };
  }
  return { ok: true, missing: [] };
}

export function writePublicWebEnv(root, env) {
  const lines = [
    '# Gerado pelo CampfireWeb apenas com configuracao publica do frontend.',
    '# Este arquivo e ignorado pelo Git e NAO deve conter segredos de servidor.',
    ...PUBLIC_KEYS.filter((key) => env[key]).map((key) => `${key}=${env[key]}`),
    '',
  ];
  const target = path.join(root, '.env.web.local');
  fs.writeFileSync(target, lines.join('\n'), 'utf8');
  return target;
}

export function prepareCampfireWebEnv(root = process.cwd()) {
  const sourceRoot = process.env.CAMPFIRE_DESKTOP_SOURCE || 'C:\\messenger';
  const env = resolveCampfireWebEnv(root, sourceRoot);
  const check = validateCampfireWebEnv(env);
  if (!check.ok) {
    if (check.missing?.length) {
      console.error(`[ERRO] Configuracao publica do CampfireWeb ausente: ${check.missing.join(', ')}`);
    } else {
      console.error(`[ERRO] ${check.reason || 'Configuracao publica do CampfireWeb invalida.'}`);
    }
    console.error(`[INFO] Coloque as variaveis em .env.web.local nesta pasta ou mantenha o .env valido em ${sourceRoot}.`);
    return { ok: false, env, target: null };
  }

  const target = writePublicWebEnv(root, env);
  console.log('[PASS] Configuracao publica do Supabase encontrada e preparada para o build Web.');
  console.log(`[PASS] Arquivo local: ${path.basename(target)} (somente VITE_* publicas).`);
  return { ok: true, env, target };
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirect) {
  const result = prepareCampfireWebEnv(process.cwd());
  if (!result.ok) process.exitCode = 2;
}
