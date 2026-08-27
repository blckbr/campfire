export const ANIME_ALLOWED_HOSTS = Object.freeze([
  'animefire.io',
  'sushianimes.com.br',
  'anroll.plus',
  'animesonlinecc.to',
  'donghuanosekai.com',
  'goyabu.io',
]);

const BLOCKED_ANIME_HOSTS = Object.freeze([
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adnxs.com',
  'adsrvr.org',
  'criteo.com',
  'criteo.net',
  'exoclick.com',
  'exosrv.com',
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'onclicka.com',
  'onclickperformance.com',
  'adsterra.com',
  'trafficjunky.net',
  'juicyads.com',
  'ero-advertising.com',
  'pushground.com',
  'hilltopads.net',
  'yllix.com',
  'realsrv.com',
  'tsyndicate.com',
  'monetag.com',
  'histats.com',
  'scorecardresearch.com',
]);

function normalizedHost(rawUrl) {
  try {
    return new URL(String(rawUrl || '')).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function hostMatches(host, domains) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function isBlockedAnimeRequest(rawUrl) {
  const host = normalizedHost(rawUrl);
  if (!host) return false;
  return hostMatches(host, BLOCKED_ANIME_HOSTS);
}

export function shouldLoadPopupInAnimeView(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (isBlockedAnimeRequest(url.toString())) return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return hostMatches(host, ANIME_ALLOWED_HOSTS);
  } catch {
    return false;
  }
}

export function animeCosmeticCss() {
  return `
    .adsbygoogle,
    ins.adsbygoogle,
    [data-ad-slot],
    [id^="google_ads"],
    [id*="google_ads"],
    [class~="ad-banner"],
    [class~="ad-container"],
    [class~="advertisement"] {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
      width: 0 !important;
      height: 0 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
    }
  `;
}
