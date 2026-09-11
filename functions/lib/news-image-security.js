const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export const NEWS_HTML_MAX_BYTES = 2 * 1024 * 1024;
export const NEWS_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const NEWS_MAX_REDIRECTS = 5;
export const NEWS_FETCH_TIMEOUT_MS = 8000;

function parseIpv4(host) {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => n < 0 || n > 255)) return null;
  return nums;
}

function ipv4In(nums, a, bStart = 0, bEnd = 255) {
  return nums[0] === a && nums[1] >= bStart && nums[1] <= bEnd;
}

export function isPrivateOrReservedIp(raw) {
  const value = String(raw || '').trim().replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = parseIpv4(value);
  if (v4) {
    const [a, b] = v4;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 192 && b === 2) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && v4[2] === 100) return true;
    if (a === 203 && b === 0 && v4[2] === 113) return true;
    return false;
  }

  if (!value.includes(':')) return false;
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('ff')) return true;
  if (value.startsWith('2001:db8:') || value === '2001:db8::') return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateOrReservedIp(mapped[1]) : false;
}

function isIpLiteral(hostname) {
  return parseIpv4(hostname) !== null || hostname.includes(':');
}

export async function isAllowedPublicHttpUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return false;
    if (isIpLiteral(hostname) && isPrivateOrReservedIp(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function resolvePublicDns(hostname, { fetchImpl = fetch } = {}) {
  const encoded = encodeURIComponent(hostname);
  const headers = { accept: 'application/dns-json' };
  const answers = [];
  for (const type of ['A', 'AAAA']) {
    const response = await fetchImpl(`https://cloudflare-dns.com/dns-query?name=${encoded}&type=${type}`, { headers });
    if (!response.ok) continue;
    const json = await response.json();
    for (const answer of Array.isArray(json.Answer) ? json.Answer : []) {
      if (typeof answer?.data === 'string') answers.push(answer.data);
    }
  }
  return [...new Set(answers)];
}

export async function validatePublicHttpUrl(rawUrl, { resolver = resolvePublicDns } = {}) {
  if (!(await isAllowedPublicHttpUrl(rawUrl))) throw new Error('Blocked non-public URL');
  const url = new URL(rawUrl);
  if (isIpLiteral(url.hostname)) return url;
  const addresses = await resolver(url.hostname);
  if (!Array.isArray(addresses) || addresses.length === 0) throw new Error('DNS resolution failed closed');
  for (const address of addresses) {
    if (isPrivateOrReservedIp(address)) throw new Error('DNS resolved to a private or reserved address');
  }
  return url;
}

export async function fetchWithSafeRedirects(rawUrl, {
  fetchImpl = fetch,
  resolver = resolvePublicDns,
  maxRedirects = NEWS_MAX_REDIRECTS,
  timeoutMs = NEWS_FETCH_TIMEOUT_MS,
  init = {},
} = {}) {
  let current = String(rawUrl);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const safe = await validatePublicHttpUrl(current, { resolver });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(safe.href, { ...init, redirect: 'manual', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: safe.href, redirects: redirect };
    }
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirect missing Location');
    if (redirect >= maxRedirects) throw new Error('Too many redirects');
    const next = new URL(location, safe).href;
    if (!(await isAllowedPublicHttpUrl(next))) throw new Error('Blocked redirect target');
    current = next;
  }
  throw new Error('Too many redirects');
}

export async function readResponseBodyLimited(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('Response body too large');
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error('Response body too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function isAcceptedImageContentType(raw) {
  const type = String(raw || '').split(';', 1)[0].trim().toLowerCase();
  return ACCEPTED_IMAGE_TYPES.has(type);
}

export async function fetchHtmlDocument(url, options = {}) {
  const result = await fetchWithSafeRedirects(url, {
    ...options,
    init: {
      headers: {
        'user-agent': 'CampfireNewsImageResolver/1.1',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2',
        ...(options.init?.headers || {}),
      },
    },
  });
  if (!result.response.ok) throw new Error(`Article fetch failed: ${result.response.status}`);
  const type = String(result.response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error('Article did not return HTML');
  const bytes = await readResponseBodyLimited(result.response, NEWS_HTML_MAX_BYTES);
  return { ...result, html: new TextDecoder().decode(bytes) };
}

export async function fetchValidatedImage(url, options = {}) {
  const result = await fetchWithSafeRedirects(url, {
    ...options,
    init: {
      headers: {
        'user-agent': 'CampfireNewsImageResolver/1.1',
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8',
        ...(options.init?.headers || {}),
      },
    },
  });
  if (!result.response.ok) throw new Error(`Image fetch failed: ${result.response.status}`);
  const contentType = result.response.headers.get('content-type') || '';
  if (!isAcceptedImageContentType(contentType)) throw new Error('Rejected image content type');
  const bytes = await readResponseBodyLimited(result.response, NEWS_IMAGE_MAX_BYTES);
  return { ...result, bytes, contentType: contentType.split(';', 1)[0].trim().toLowerCase() };
}
