export type NewsImageCandidateSource =
  | "feed"
  | "og:image"
  | "twitter:image"
  | "jsonld"
  | "image_src"
  | "srcset"
  | "lazy"
  | "article"
  | "publisher-logo";

export type NewsImageCandidate = {
  url: string;
  source: NewsImageCandidateSource;
  priority: number;
};

export type NewsImageResolveResult = {
  finalArticleUrl: string;
  candidates: NewsImageCandidate[];
};
