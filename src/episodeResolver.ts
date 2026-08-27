/* ============================================================
   CAMPFIRE EPISODE RESOLVER
   ============================================================

   Anime + episódio
        ↓
   Episode Resolver API
        ↓
   página real do episódio
        ↓
   Media Resolver
        ↓
   mídia reproduzível
        ↓
   Campfire Media Server
        ↓
   Watch Together
   ============================================================ */


export type AnimeSourceId =
  | "animefire"
  | "sushi"
  | "anroll"
  | "animesonline"
  | "donghua"
  | "goyabu"
  | "demo";


export type ResolvedMediaType =
  | "hls"
  | "html5"
  | "embed";


export type EpisodeMediaStatus =
  | "ready"
  | "unsupported"
  | "embed_only"
  | "fetch_error"
  | "not_found"
  | "not_checked"
  | "resolver_error";


export type EpisodeResolveRequest = {
  animeId?: string;

  animeTitle: string;

  alternativeTitle?: string;

  japaneseTitle?: string;

  episodeNumber:
    number;

  episodeLabel?: string;

  preferredSources?:
    AnimeSourceId[];
};


export type ResolvedEpisodePage = {
  sourceId:
    AnimeSourceId;

  sourceName:
    string;

  animePageUrl:
    string;

  episodePageUrl:
    string;

  episodeNumber:
    number;

  matchedTitle?:
    string;
};


export type ResolvedEpisodeMedia = {
  sourceId:
    AnimeSourceId;

  sourceName:
    string;

  mediaType:
    ResolvedMediaType;

  mediaUrl:
    string;

  sourcePageUrl?:
    string;

  quality?:
    string;

  animeTitle:
    string;

  episodeNumber:
    number;

  episodeLabel:
    string;
};


export type EpisodeResolveAttempt = {
  sourceId:
    AnimeSourceId;

  sourceName:
    string;

  success:
    boolean;

  reason?:
    string;

  page?:
    ResolvedEpisodePage;

  media?:
    ResolvedEpisodeMedia;
};


export type EpisodeResolveResult = {
  success:
    boolean;

  page:
    ResolvedEpisodePage |
    null;

  mediaStatus:
    EpisodeMediaStatus;

  media:
    ResolvedEpisodeMedia |
    null;

  attempts:
    EpisodeResolveAttempt[];
};


export const EPISODE_SOURCES:
  {
    id:
      AnimeSourceId;

    name:
      string;

    priority:
      number;
  }[] =
[
  {
    id:
      "animefire",

    name:
      "AnimeFire",

    priority:
      10,
  },

  {
    id:
      "sushi",

    name:
      "Sushi Animes",

    priority:
      20,
  },

  {
    id:
      "anroll",

    name:
      "AnimesROLL",

    priority:
      30,
  },

  {
    id:
      "animesonline",

    name:
      "Animes Online",

    priority:
      40,
  },

  {
    id:
      "donghua",

    name:
      "Donghua no Sekai",

    priority:
      50,
  },

  {
    id:
      "goyabu",

    name:
      "Goyabu",

    priority:
      60,
  },
];


type EpisodeApiSuccess = {
  ok:
    true;

  found:
    true;

  sourceId:
    string;

  sourceName:
    string;

  animePageUrl:
    string;

  episodePageUrl:
    string;

  episodeNumber:
    number;

  matchedTitle?:
    string;

  mediaStatus?:
    EpisodeMediaStatus;

  attempts?:
    Array<{
      sourceId?: string;
      sourceName?: string;
      pageFound?: boolean;
      episodePageUrl?: string;
      mediaStatus?: EpisodeMediaStatus;
      message?: string | null;
    }>;

  media:
    null |
    {
      mediaType?:
        string;

      mediaUrl?:
        string;

      quality?:
        string;
    };
};


type EpisodeApiFailure = {
  ok:
    false;

  found?:
    false;

  sourceId?:
    string;

  sourceName?:
    string;

  error?:
    string;
};


function sourceName(
  id:
    AnimeSourceId
): string {
  if (
    id ===
    "demo"
  ) {
    return "Campfire Test";
  }


  return (
    EPISODE_SOURCES.find(
      (
        source
      ) =>
        source.id ===
        id
    )?.name ??
    id
  );
}


function normalizeEpisodeLabel(
  request:
    EpisodeResolveRequest
): string {
  return (
    request.episodeLabel?.trim() ||
    `Episódio ${request.episodeNumber}`
  );
}


function normalizeSourceId(
  value:
    string |
    undefined
): AnimeSourceId {
  const known =
    EPISODE_SOURCES.some(
      (
        source
      ) =>
        source.id ===
        value
    );


  return known
    ? value as AnimeSourceId
    : "animefire";
}


/* ============================================================
   REAL EPISODE API
   ============================================================ */

export async function
resolveEpisodeFromServer(
  request:
    EpisodeResolveRequest,

  apiBaseUrl =
    "http://127.0.0.1:8788"
): Promise<EpisodeResolveResult> {
  const base =
    apiBaseUrl.replace(
      /\/+$/,
      ""
    );


  const params =
    new URLSearchParams();


  params.set(
    "anime",
    request.animeTitle
  );


  params.set(
    "episode",
    String(
      request.episodeNumber
    )
  );


  if (
    request.alternativeTitle
  ) {
    params.set(
      "alternativeTitle",
      request.alternativeTitle
    );
  }


  if (
    request.japaneseTitle
  ) {
    params.set(
      "japaneseTitle",
      request.japaneseTitle
    );
  }


  let response:
    Response;


  try {
    response =
      await fetch(
        `${base}/resolve?${params.toString()}`,
        {
          method:
            "GET",

          headers: {
            Accept:
              "application/json",
          },
        }
      );
  } catch {
    throw new Error(
      "O Campfire Episode Resolver não está acessível em 127.0.0.1:8788."
    );
  }


  let payload:
    EpisodeApiSuccess |
    EpisodeApiFailure;


  try {
    payload =
      await response.json() as
        EpisodeApiSuccess |
        EpisodeApiFailure;
  } catch {
    throw new Error(
      "O Episode Resolver respondeu em um formato inválido."
    );
  }


  if (
    !response.ok ||
    !payload.ok
  ) {
    const sourceId =
      normalizeSourceId(
        "sourceId" in payload
          ? payload.sourceId
          : undefined
      );


    return {
      success:
        false,

      page:
        null,

      mediaStatus:
        "not_found",

      media:
        null,

      attempts: [
        {
          sourceId,

          sourceName:
            "sourceName" in payload &&
            payload.sourceName
              ? payload.sourceName
              : sourceName(
                  sourceId
                ),

          success:
            false,

          reason:
            "error" in payload &&
            payload.error
              ? payload.error
              : "EPISODE_NOT_FOUND",
        },
      ],
    };
  }


  const sourceId =
    normalizeSourceId(
      payload.sourceId
    );


  const page:
    ResolvedEpisodePage =
    {
      sourceId,

      sourceName:
        payload.sourceName,

      animePageUrl:
        payload.animePageUrl,

      episodePageUrl:
        payload.episodePageUrl,

      episodeNumber:
        payload.episodeNumber,

      matchedTitle:
        payload.matchedTitle,
    };


  let media:
    ResolvedEpisodeMedia |
    null =
      null;


  if (
    payload.media?.mediaUrl
  ) {
    const rawType =
      payload.media.mediaType;


    const mediaType:
      ResolvedMediaType =
      rawType ===
        "embed"
        ? "embed"

        : rawType ===
            "html5"
          ? "html5"

          : "hls";


    media = {
      sourceId,

      sourceName:
        payload.sourceName,

      mediaType,

      mediaUrl:
        payload.media.mediaUrl,

      sourcePageUrl:
        payload.episodePageUrl,

      quality:
        payload.media.quality,

      animeTitle:
        request.animeTitle,

      episodeNumber:
        request.episodeNumber,

      episodeLabel:
        normalizeEpisodeLabel(
          request
        ),
    };
  }


  return {
    success:
      true,

    page,

    mediaStatus:
      payload.mediaStatus ??
      (media
        ? "ready"
        : "unsupported"),

    media,

    attempts:
      payload.attempts?.map(
        attempt => ({
          sourceId:
            normalizeSourceId(
              attempt.sourceId
            ),

          sourceName:
            attempt.sourceName ??
            sourceName(
              normalizeSourceId(
                attempt.sourceId
              )
            ),

          success:
            Boolean(
              attempt.pageFound
            ),

          reason:
            attempt.message ??
            attempt.mediaStatus ??
            undefined,
        })
      ) ?? [
      {
        sourceId,

        sourceName:
          payload.sourceName,

        success:
          true,

        reason:
          media
            ? "MEDIA_READY"
            : "EPISODE_PAGE_FOUND",

        page,

        media:
          media ??
          undefined,
      },
    ],
  };
}


/* ============================================================
   SOURCE REGISTRY
   ============================================================ */

export type SourceResolver =
  (
    request:
      EpisodeResolveRequest
  ) =>
    Promise<
      ResolvedEpisodeMedia |
      null
    >;


const sourceResolvers =
  new Map<
    AnimeSourceId,
    SourceResolver
  >();


export function
registerEpisodeSource(
  source:
    AnimeSourceId,

  resolver:
    SourceResolver
): void {
  sourceResolvers.set(
    source,
    resolver
  );
}


export function
unregisterEpisodeSource(
  source:
    AnimeSourceId
): void {
  sourceResolvers.delete(
    source
  );
}


export async function
resolveEpisode(
  request:
    EpisodeResolveRequest
): Promise<EpisodeResolveResult> {
  const attempts:
    EpisodeResolveAttempt[] =
      [];


  const sources =
    request.preferredSources?.length

      ? request.preferredSources

      : EPISODE_SOURCES
          .slice()
          .sort(
            (
              a,
              b
            ) =>
              a.priority -
              b.priority
          )
          .map(
            (
              source
            ) =>
              source.id
          );


  for (
    const sourceId
    of sources
  ) {
    const resolver =
      sourceResolvers.get(
        sourceId
      );


    if (!resolver) {
      attempts.push({
        sourceId,

        sourceName:
          sourceName(
            sourceId
          ),

        success:
          false,

        reason:
          "Fonte ainda não possui Media Resolver instalado.",
      });

      continue;
    }


    try {
      const media =
        await resolver(
          request
        );


      if (!media) {
        attempts.push({
          sourceId,

          sourceName:
            sourceName(
              sourceId
            ),

          success:
            false,

          reason:
            "Mídia compatível não encontrada.",
        });

        continue;
      }


      attempts.push({
        sourceId,

        sourceName:
          sourceName(
            sourceId
          ),

        success:
          true,

        reason:
          "MEDIA_READY",

        media,
      });


      return {
        success:
          true,

        page:
          null,

        mediaStatus:
          "ready",

        media,

        attempts,
      };
    } catch (
      error
    ) {
      attempts.push({
        sourceId,

        sourceName:
          sourceName(
            sourceId
          ),

        success:
          false,

        reason:
          error instanceof Error
            ? error.message
            : "Erro desconhecido.",
      });
    }
  }


  return {
    success:
      false,

    page:
      null,

    mediaStatus:
      "not_found",

    media:
      null,

    attempts,
  };
}


/* ============================================================
   DEMO — MANTIDO APENAS PARA TESTES
   ============================================================ */

export function
installCampfireDemoResolver(
  mediaServerBaseUrl =
    "http://127.0.0.1:8787"
): void {
  registerEpisodeSource(
    "demo",

    async (
      request
    ) => {
      const base =
        mediaServerBaseUrl.replace(
          /\/+$/,
          ""
        );


      return {
        sourceId:
          "demo",

        sourceName:
          "Campfire Test",

        mediaType:
          "hls",

        mediaUrl:
          `${base}/master.m3u8`,

        quality:
          "Auto",

        animeTitle:
          request.animeTitle,

        episodeNumber:
          request.episodeNumber,

        episodeLabel:
          normalizeEpisodeLabel(
            request
          ),
      };
    }
  );
}


export async function
resolveEpisodeWithDemo(
  request:
    EpisodeResolveRequest,

  mediaServerBaseUrl =
    "http://127.0.0.1:8787"
): Promise<EpisodeResolveResult> {
  installCampfireDemoResolver(
    mediaServerBaseUrl
  );


  return await resolveEpisode({
    ...request,

    preferredSources: [
      "demo",
    ],
  });
}
