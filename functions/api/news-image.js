import { resolveNewsImageCandidates } from '../../src/news/newsImageCandidates.ts';
import {
  fetchHtmlDocument,
  fetchValidatedImage,
} from '../lib/news-image-security.js';

const RESOLVE_CACHE = 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600';
const IMAGE_CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

function json(body, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      'x-content-type-options': 'nosniff',
    },
  });
}

function proxyUrlFor(requestUrl, article, feed, index) {
  const url = new URL(requestUrl);
  url.search = '';
  url.searchParams.set('article', article);
  if (feed) url.searchParams.set('feed', feed);
  url.searchParams.set('mode', 'proxy');
  url.searchParams.set('candidate', String(index));
  return `${url.pathname}${url.search}`;
}

async function resolveArticle(requestUrl) {
  const request = new URL(requestUrl);
  const article = request.searchParams.get('article')?.trim() || '';
  const feed = request.searchParams.get('feed')?.trim() || undefined;
  if (!article) throw new Error('Missing article URL');

  const { html, finalUrl } = await fetchHtmlDocument(article);
  let candidates = resolveNewsImageCandidates(html, finalUrl, feed);

  // A conventional favicon is a last publisher-identity attempt if metadata did not expose one.
  if (!candidates.some((item) => item.source === 'publisher-logo')) {
    const favicon = new URL('/favicon.ico', finalUrl).href;
    if (!candidates.some((item) => item.url === favicon)) {
      candidates = [...candidates, { url: favicon, source: 'publisher-logo', priority: 90 }];
    }
  }

  return { article, feed, finalArticleUrl: finalUrl, candidates };
}

export async function onRequestGet(context) {
  try {
    const requestUrl = context.request.url;
    const url = new URL(requestUrl);
    const mode = (url.searchParams.get('mode') || 'resolve').toLowerCase();
    const resolved = await resolveArticle(requestUrl);

    if (mode === 'resolve') {
      return json({
        finalArticleUrl: resolved.finalArticleUrl,
        candidates: resolved.candidates.map((candidate, index) => ({
          ...candidate,
          proxyUrl: proxyUrlFor(requestUrl, resolved.article, resolved.feed, index),
        })),
      }, 200, RESOLVE_CACHE);
    }

    if (mode === 'proxy') {
      const rawIndex = url.searchParams.get('candidate');
      const index = Number(rawIndex);
      if (!Number.isInteger(index) || index < 0 || index >= resolved.candidates.length) {
        return json({ error: 'Invalid resolved image candidate' }, 400);
      }

      // The client selects only an index into candidates re-derived from the article.
      // It cannot pass an arbitrary image URL through this endpoint.
      const selected = resolved.candidates[index];
      const image = await fetchValidatedImage(selected.url);
      return new Response(image.bytes, {
        status: 200,
        headers: {
          'content-type': image.contentType,
          'content-length': String(image.bytes.byteLength),
          'Cache-Control': IMAGE_CACHE,
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        },
      });
    }

    return json({ error: 'Unsupported mode' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'News image resolution failed';
    const status = /Missing article|Blocked|private|reserved|credentials|Unsupported|Invalid/i.test(message) ? 400 : 502;
    return json({ error: message }, status);
  }
}
