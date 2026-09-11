import type { NewsImageCandidate, NewsImageCandidateSource } from "./newsImageTypes.js";

const SOURCE_PRIORITY: Record<NewsImageCandidateSource, number> = {
  feed: 10,
  "og:image": 20,
  "twitter:image": 30,
  jsonld: 40,
  image_src: 50,
  srcset: 60,
  lazy: 70,
  article: 80,
  "publisher-logo": 90,
};

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attrs(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag))) {
    result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "").trim();
  }
  return result;
}

function normalize(raw: string | undefined, pageUrl: string): string | null {
  if (!raw) return null;
  const value = decodeHtml(raw.trim());
  if (!value || /^(?:data|blob|javascript|file):/i.test(value)) return null;
  try {
    const url = new URL(value, pageUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const probe = `${url.pathname}${url.search}`.toLowerCase();
    if (/(?:^|[\/_\-.])(pixel|spacer|tracking|tracker|beacon|blank|transparent)(?:[\/_\-.]|$)/.test(probe)) return null;
    if (/(?:^|[^0-9])1x1(?:[^0-9]|$)/.test(probe)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function srcsetUrls(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function collectJsonLdImages(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdImages(item, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  for (const key of ["url", "contentUrl"]) {
    if (typeof object[key] === "string") out.push(object[key] as string);
  }
}

function extractJsonLd(html: string): string[] {
  const out: string[] = [];
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const data = JSON.parse(match[1].trim());
      const visit = (node: unknown): void => {
        if (Array.isArray(node)) {
          for (const item of node) visit(item);
          return;
        }
        if (!node || typeof node !== "object") return;
        const object = node as Record<string, unknown>;
        for (const key of ["image", "thumbnailUrl", "associatedMedia"]) {
          if (object[key] !== undefined) collectJsonLdImages(object[key], out);
        }
        if (object["@graph"] !== undefined) visit(object["@graph"]);
      };
      visit(data);
    } catch {
      // Invalid JSON-LD must not break the remaining metadata candidates.
    }
  }
  return out;
}

export function resolveNewsImageCandidates(
  html: string,
  pageUrl: string,
  feedImageUrl?: string
): NewsImageCandidate[] {
  const candidates: NewsImageCandidate[] = [];
  const seen = new Set<string>();

  const add = (raw: string | undefined, source: NewsImageCandidateSource) => {
    const url = normalize(raw, pageUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push({ url, source, priority: SOURCE_PRIORITY[source] });
  };

  add(feedImageUrl, "feed");

  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => attrs(match[0]));
  for (const meta of metas) {
    const key = (meta.property || meta.name || "").toLowerCase();
    if (key === "og:image:secure_url") add(meta.content, "og:image");
  }
  for (const meta of metas) {
    const key = (meta.property || meta.name || "").toLowerCase();
    if (key === "og:image" || key === "og:image:url") add(meta.content, "og:image");
  }
  for (const meta of metas) {
    const key = (meta.property || meta.name || "").toLowerCase();
    if (key === "twitter:image" || key === "twitter:image:src") add(meta.content, "twitter:image");
  }

  for (const url of extractJsonLd(html)) add(url, "jsonld");

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    const rel = (a.rel || "").toLowerCase().split(/\s+/);
    if (rel.includes("image_src")) add(a.href, "image_src");
  }

  const mediaTags = [...html.matchAll(/<(?:source|img)\b[^>]*>/gi)];
  for (const match of mediaTags) {
    const a = attrs(match[0]);
    if (a.srcset) for (const url of srcsetUrls(a.srcset)) add(url, "srcset");
    if (a["data-srcset"]) for (const url of srcsetUrls(a["data-srcset"])) add(url, "srcset");
  }

  const lazyNames = ["data-src", "data-original", "data-lazy-src", "data-original-src", "data-image-src"];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    for (const key of lazyNames) add(a[key], "lazy");
  }

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    const classAndAlt = `${a.class || ""} ${a.id || ""} ${a.alt || ""}`.toLowerCase();
    if (/\b(?:logo|icon|avatar|author|profile)\b/.test(classAndAlt)) continue;
    add(a.src, "article");
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    const rel = (a.rel || "").toLowerCase().split(/\s+/);
    if (rel.includes("icon") || rel.includes("apple-touch-icon")) add(a.href, "publisher-logo");
  }
  for (const meta of metas) {
    const key = (meta.property || meta.name || "").toLowerCase();
    if (key === "og:logo") add(meta.content, "publisher-logo");
  }

  return candidates.sort((a, b) => a.priority - b.priority);
}
