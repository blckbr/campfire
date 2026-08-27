import {
  Webview,
} from "./desktop";

import {
  getCurrentWindow,
} from "./desktop";

import {
  LogicalPosition,
  LogicalSize,
} from "./desktop";

import {
  invoke,
} from "./desktop";


export const
ANIME_SOURCE_WEBVIEW_LABEL =
  "campfire-anime-source";


export type AnimeWebviewBounds = {
  x: number;

  y: number;

  width: number;

  height: number;
};


const ALLOWED_ANIME_HOSTS = [
  "animefire.io",
  "sushianimes.com.br",
  "anroll.plus",
  "animesonlinecc.to",
  "donghuanosekai.com",
  "goyabu.io",
];


function normalizeAnimeUrl(
  rawUrl: string
): string {
  const url =
    new URL(
      rawUrl
    );


  if (
    url.protocol !==
      "https:" &&
    url.protocol !==
      "http:"
  ) {
    throw new Error(
      "A fonte precisa usar HTTP ou HTTPS."
    );
  }


  const hostname =
    url.hostname
      .toLowerCase()
      .replace(
        /^www\./,
        ""
      );


  const allowed =
    ALLOWED_ANIME_HOSTS
      .some(
        (
          domain
        ) =>
          hostname ===
            domain ||
          hostname.endsWith(
            `.${domain}`
          )
      );


  if (!allowed) {
    throw new Error(
      "Esta URL não pertence a uma fonte de anime permitida pelo Campfire."
    );
  }


  return url.toString();
}


export async function
closeAnimeSourceWebview():
  Promise<void> {
  const existing =
    await Webview.getByLabel(
      ANIME_SOURCE_WEBVIEW_LABEL
    );


  if (!existing) {
    return;
  }


  try {
    await existing.close();
  } catch (
    error
  ) {
    console.warn(
      "Erro fechando WebView de anime:",
      error
    );
  }
}


export async function
hideAnimeSourceWebview():
  Promise<void> {
  const existing =
    await Webview.getByLabel(
      ANIME_SOURCE_WEBVIEW_LABEL
    );


  if (!existing) {
    return;
  }


  await existing.hide();
}


export async function
showAnimeSourceWebview():
  Promise<void> {
  const existing =
    await Webview.getByLabel(
      ANIME_SOURCE_WEBVIEW_LABEL
    );


  if (!existing) {
    return;
  }


  await existing.show();
}


export async function
resizeAnimeSourceWebview(
  bounds:
    AnimeWebviewBounds
): Promise<void> {
  const existing =
    await Webview.getByLabel(
      ANIME_SOURCE_WEBVIEW_LABEL
    );


  if (!existing) {
    return;
  }


  await existing.setPosition(
    new LogicalPosition(
      Math.max(
        0,
        bounds.x
      ),

      Math.max(
        0,
        bounds.y
      )
    )
  );


  await existing.setSize(
    new LogicalSize(
      Math.max(
        1,
        bounds.width
      ),

      Math.max(
        1,
        bounds.height
      )
    )
  );
}


export async function
openAnimeSourceWebview(
  rawUrl: string,

  bounds:
    AnimeWebviewBounds
): Promise<Webview> {
  const url =
    normalizeAnimeUrl(
      rawUrl
    );


  /*
   * Sempre destruímos a WebView
   * anterior.
   *
   * Isso evita manter um vídeo antigo
   * tocando escondido.
   */

  await closeAnimeSourceWebview();


  const appWindow =
    getCurrentWindow();


  return await new Promise<
    Webview
  >(
    (
      resolve,
      reject
    ) => {
      const webview =
        new Webview(
          appWindow,

          ANIME_SOURCE_WEBVIEW_LABEL,

          {
            url,

            x:
              Math.max(
                0,
                bounds.x
              ),

            y:
              Math.max(
                0,
                bounds.y
              ),

            width:
              Math.max(
                1,
                bounds.width
              ),

            height:
              Math.max(
                1,
                bounds.height
              ),
          }
        );


      void webview.once(
        "tauri://created",

        () => {
          resolve(
            webview
          );
        }
      );


      void webview.once(
        "tauri://error",

        (
          event
        ) => {
          console.error(
            "Erro criando WebView de anime:",
            event
          );


          reject(
            new Error(
              "Não foi possível abrir a fonte dentro do Campfire."
            )
          );
        }
      );
    }
  );
}


export async function
getAnimeSourceCurrentUrl():
  Promise<string> {
  return await invoke<string>(
    "campfire_anime_webview_url",

    {
      webviewLabel:
        ANIME_SOURCE_WEBVIEW_LABEL,
    }
  );
}


export async function
evalAnimeSource(
  script: string
): Promise<void> {
  await invoke(
    "campfire_anime_webview_eval",

    {
      webviewLabel:
        ANIME_SOURCE_WEBVIEW_LABEL,

      script,
    }
  );
}