import { useEffect, useMemo, useState } from "react";
import { getNewsImageCandidates } from "../news/newsImageClient";
import "./CampfireNewsImage.css";

type Props = {
  articleUrl: string;
  feedImageUrl?: string;
  alt: string;
  fallbackUrl: string;
  className?: string;
};

function mergeUnique(...groups: Array<Array<string | undefined>>): string[] {
  const out: string[] = [];
  for (const group of groups) {
    for (const value of group) {
      const url = value?.trim();
      if (url && !out.includes(url)) out.push(url);
    }
  }
  return out;
}

export default function CampfireNewsImage({
  articleUrl,
  feedImageUrl,
  alt,
  fallbackUrl,
  className = "",
}: Props) {
  const initial = useMemo(
    () => mergeUnique([feedImageUrl], [fallbackUrl]),
    [feedImageUrl, fallbackUrl]
  );
  const [candidates, setCandidates] = useState(initial);
  const [index, setIndex] = useState(0);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCandidates(initial);
    setIndex(0);
    setFallbackFailed(false);

    void getNewsImageCandidates(articleUrl, feedImageUrl)
      .then((resolved) => {
        if (cancelled) return;
        setCandidates(mergeUnique([feedImageUrl], resolved, [fallbackUrl]));
      })
      .catch(() => {
        // Feed image + bundled Campfire cover remain a deterministic offline fallback.
      });

    return () => {
      cancelled = true;
    };
  }, [articleUrl, feedImageUrl, fallbackUrl, initial]);

  if (fallbackFailed) {
    return (
      <span className={`campfireNewsImageFallback ${className}`.trim()} role="img" aria-label={alt}>
        🔥
      </span>
    );
  }

  const src = candidates[index] || fallbackUrl;
  const isFinalFallback = src === fallbackUrl && index >= candidates.length - 1;

  return (
    <img
      className={`campfireNewsImage ${className}`.trim()}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (index < candidates.length - 1) {
          setIndex((current) => Math.min(current + 1, candidates.length - 1));
        } else if (isFinalFallback) {
          setFallbackFailed(true);
        }
      }}
    />
  );
}
