export type ClientNewsImageCandidate = {
  url: string;
  source?: string;
  proxyUrl?: string;
};

const DEFAULT_PUBLIC_NEWS_IMAGE_ENDPOINT =
  "https://campfire-br.pages.dev/api/news-image";

function configuredEndpoint(): string {
  const configured = String(
    import.meta.env.VITE_CAMPFIRE_NEWS_IMAGE_ENDPOINT || ""
  ).trim();
  if (configured) return configured;
  if (typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)) {
    return "/api/news-image";
  }
  return DEFAULT_PUBLIC_NEWS_IMAGE_ENDPOINT;
}

function absoluteProxyUrl(proxyUrl: string, endpoint: string): string {
  try {
    const base = endpoint.startsWith("http")
      ? endpoint
      : typeof window !== "undefined"
        ? window.location.origin
        : DEFAULT_PUBLIC_NEWS_IMAGE_ENDPOINT;
    return new URL(proxyUrl, base).href;
  } catch {
    return proxyUrl;
  }
}

export async function getNewsImageCandidates(
  articleUrl: string,
  feedImageUrl?: string
): Promise<string[]> {
  const endpoint = configuredEndpoint();
  const requestUrl = endpoint.startsWith("http")
    ? new URL(endpoint)
    : new URL(endpoint, window.location.origin);
  requestUrl.searchParams.set("article", articleUrl);
  requestUrl.searchParams.set("mode", "resolve");
  if (feedImageUrl?.trim()) requestUrl.searchParams.set("feed", feedImageUrl.trim());

  const response = await fetch(requestUrl.href, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`News image resolver returned ${response.status}`);
  const body = (await response.json()) as { candidates?: ClientNewsImageCandidate[] };
  const urls: string[] = [];
  for (const candidate of Array.isArray(body.candidates) ? body.candidates : []) {
    const preferred = candidate.proxyUrl
      ? absoluteProxyUrl(candidate.proxyUrl, endpoint)
      : candidate.url;
    if (preferred && !urls.includes(preferred)) urls.push(preferred);
  }
  return urls;
}
