export type AnimeSourceId =
  | "animefire"
  | "sushi"
  | "anroll"
  | "animesonline"
  | "donghua"
  | "goyabu";


export type AnimeSource = {
  id:
    AnimeSourceId;

  name:
    string;

  shortName:
    string;

  domain:
    string;

  homeUrl:
    string;

  emoji:
    string;

  category:
    "anime" | "donghua";
};


export const ANIME_SOURCES:
  AnimeSource[] = [

    {
      id:
        "animefire",

      name:
        "AnimeFire",

      shortName:
        "AnimeFire",

      domain:
        "animefire.io",

      homeUrl:
        "https://animefire.io/",

      emoji:
        "🔥",

      category:
        "anime",
    },


    {
      id:
        "sushi",

      name:
        "Sushi Animes",

      shortName:
        "Sushi",

      domain:
        "sushianimes.com.br",

      homeUrl:
        "https://sushianimes.com.br/",

      emoji:
        "🍣",

      category:
        "anime",
    },


    {
      id:
        "anroll",

      name:
        "AnimesROLL",

      shortName:
        "AnimesROLL",

      domain:
        "anroll.plus",

      homeUrl:
        "http://anroll.plus/",

      emoji:
        "▶️",

      category:
        "anime",
    },


    {
      id:
        "animesonline",

      name:
        "Animes Online CC",

      shortName:
        "AnimesOnline",

      domain:
        "animesonlinecc.to",

      homeUrl:
        "https://animesonlinecc.to/",

      emoji:
        "📺",

      category:
        "anime",
    },


    {
      id:
        "donghua",

      name:
        "Donghua no Sekai",

      shortName:
        "Donghua",

      domain:
        "donghuanosekai.com",

      homeUrl:
        "https://donghuanosekai.com/",

      emoji:
        "🐉",

      category:
        "donghua",
    },


    {
      id:
        "goyabu",

      name:
        "Goyabu",

      shortName:
        "Goyabu",

      domain:
        "goyabu.io",

      homeUrl:
        "https://goyabu.io/",

      emoji:
        "🟣",

      category:
        "anime",
    },

  ];


export function findAnimeSource(
  id:
    AnimeSourceId
) {
  return (
    ANIME_SOURCES.find(
      (
        source
      ) =>
        source.id ===
        id
    ) ??
    ANIME_SOURCES[0]
  );
}