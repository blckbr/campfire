import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CAMPFIRE_NATIVE_OVERLAY_EVENT,
  isCampfireNativeOverlayBlocked,
} from "./campfireNativeOverlay";

import "./AnimeSourceWebview.css";


type Props = {
  url: string;

  sourceName: string;

  animeTitle: string;

  episodeLabel: string;

  onClose: () => void;
};


type MinimalWebviewHandle = {
  close: () => Promise<void>;
  hide: () => Promise<void>;
  show: () => Promise<void>;
  setFocus: () => Promise<void>;
};


function makeLabel(): string {
  return (
    `campfire-source-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`
  );
}


function AnimeSourceWebview({
  url,
  sourceName,
  animeTitle,
  episodeLabel,
  onClose,
}: Props) {
  const viewportRef =
    useRef<HTMLDivElement | null>(
      null
    );


  const nativeWebviewRef =
    useRef<MinimalWebviewHandle | null>(
      null
    );


  const uiBlockedRef =
    useRef(
      isCampfireNativeOverlayBlocked()
    );


  const [
    phase,
    setPhase,
  ] =
    useState<
      "loading" |
      "created" |
      "error"
    >(
      "loading"
    );


  const [
    error,
    setError,
  ] =
    useState("");


  useEffect(() => {
    const handleOverlayChange = (
      event: Event
    ) => {
      const detail = (
        event as CustomEvent<{
          blocked?: boolean;
        }>
      ).detail;

      const blocked =
        detail?.blocked === true;

      uiBlockedRef.current =
        blocked;

      const webview =
        nativeWebviewRef.current;

      if (!webview) {
        return;
      }

      if (blocked) {
        void webview
          .hide()
          .catch(
            () => undefined
          );

        return;
      }

      void webview
        .show()
        .then(() =>
          webview.setFocus()
        )
        .catch(
          () => undefined
        );
    };

    window.addEventListener(
      CAMPFIRE_NATIVE_OVERLAY_EVENT,
      handleOverlayChange
    );

    return () => {
      window.removeEventListener(
        CAMPFIRE_NATIVE_OVERLAY_EVENT,
        handleOverlayChange
      );
    };
  }, []);


  /* ==========================================================
     CREATE ONLY AFTER COMPONENT MOUNTS
     ========================================================== */

  useEffect(() => {
    let disposed =
      false;


    let createTimer =
      0;


    async function createNativeWebview() {
      const viewport =
        viewportRef.current;


      if (!viewport) {
        return;
      }


      try {
        /*
         * IMPORTANT:
         *
         * The desktop compatibility module is imported only here.
         * If this feature fails, the AnimeBrowser module
         * itself still loads normally.
         */

        const [
          webviewApi,
          windowApi,
        ] =
          await Promise.all([
            import(
              "./desktop"
            ),

            import(
              "./desktop"
            ),
          ]);


        if (disposed) {
          return;
        }


        const rect =
          viewport
            .getBoundingClientRect();


        /*
         * Keep the child WebView strictly inside the
         * black viewport area.
         *
         * The toolbar remains React UI above it, so even
         * a white/blocked remote page cannot cover the
         * close button.
         */

        const x =
          Math.max(
            0,
            Math.round(
              rect.left
            )
          );


        const y =
          Math.max(
            0,
            Math.round(
              rect.top
            )
          );


        const width =
          Math.max(
            160,
            Math.round(
              Math.min(
                rect.width,
                window.innerWidth - x
              )
            )
          );


        const height =
          Math.max(
            160,
            Math.round(
              Math.min(
                rect.height,
                window.innerHeight - y
              )
            )
          );


        const label =
          makeLabel();


        const appWindow =
          windowApi
            .getCurrentWindow();


        const webview =
          new webviewApi.Webview(
            appWindow,
            label,
            {
              url,

              x,
              y,
              width,
              height,

              focus:
                true,

              javascriptDisabled:
                false,
            }
          );


        nativeWebviewRef.current =
          webview;


        webview.once(
          "tauri://created",
          () => {
            if (disposed) {
              void webview
                .close()
                .catch(
                  () => undefined
                );

              return;
            }


            setPhase(
              "created"
            );


            if (
              uiBlockedRef.current
            ) {
              void webview
                .hide()
                .catch(
                  () => undefined
                );
            } else {
              void webview
                .show()
                .then(() =>
                  webview.setFocus()
                )
                .catch(
                  () => undefined
                );
            }
          }
        );


        webview.once(
          "tauri://error",
          event => {
            console.error(
              "[Campfire Source WebView] tauri://error",
              event
            );


            if (!disposed) {
              setPhase(
                "error"
              );


              setError(
                "O navegador Electron interno não pôde ser criado."
              );
            }
          }
        );
      } catch (
        createError
      ) {
        console.error(
          "[Campfire Source WebView]",
          createError
        );


        if (!disposed) {
          setPhase(
            "error"
          );


          setError(
            createError instanceof Error
              ? createError.message
              : "Não foi possível iniciar o visualizador interno."
          );
        }
      }
    }


    /*
     * Give React one frame to finish the overlay layout
     * before reading the viewport coordinates.
     */

    createTimer =
      window.setTimeout(
        () => {
          void createNativeWebview();
        },
        80
      );


    return () => {
      disposed =
        true;


      window.clearTimeout(
        createTimer
      );


      const webview =
        nativeWebviewRef.current;


      nativeWebviewRef.current =
        null;


      if (webview) {
        void webview
          .close()
          .catch(
            closeError => {
              console.warn(
                "[Campfire Source WebView] erro ao fechar:",
                closeError
              );
            }
          );
      }
    };
  }, [
    url,
  ]);


  async function closeViewer() {
    const webview =
      nativeWebviewRef.current;


    nativeWebviewRef.current =
      null;


    if (webview) {
      try {
        await webview.close();
      } catch (
        closeError
      ) {
        console.warn(
          "[Campfire Source WebView] fechamento:",
          closeError
        );
      }
    }


    onClose();
  }


  async function openExternally() {
    try {
      const opener =
        await import(
          "./desktop"
        );


      await opener.openUrl(
        url
      );
    } catch (
      openError
    ) {
      console.error(
        "[Campfire Source WebView] navegador externo:",
        openError
      );
    }
  }


  return (
    <div className="animeSourceViewerOverlay">

      <section className="animeSourceViewerSafe">

        <header className="animeSourceViewerSafeHeader">

          <button
            type="button"

            className="animeSourceViewerSafeBack"

            onClick={() =>
              void closeViewer()
            }
          >
            ← Voltar aos animes
          </button>


          <div className="animeSourceViewerSafeTitle">

            <strong>
              {animeTitle}
            </strong>


            <small>
              {episodeLabel}
              {" • "}
              {sourceName}
            </small>

          </div>


          <button
            type="button"

            className="animeSourceViewerSafeExternal"

            onClick={() =>
              void openExternally()
            }
          >
            ↗ Navegador
          </button>

        </header>


        <div className="animeSourceViewerSafeInfo">

          <span>
            🧪
          </span>


          <div>

            <strong>
              Teste isolado do player da fonte
            </strong>


            <small>
              O WebContentsView só é criado agora, depois do clique. Ele não participa da inicialização do Campfire.
            </small>

          </div>

        </div>


        <div
          ref={
            viewportRef
          }

          className="animeSourceViewerSafeViewport"
        >

          {phase ===
            "loading" && (
            <div className="animeSourceViewerSafeState">

              <span>
                🔥
              </span>


              <strong>
                Criando navegador Electron interno...
              </strong>


              <small>
                A página da fonte aparecerá nesta área.
              </small>

            </div>
          )}


          {phase ===
            "created" && (
            <div className="animeSourceViewerSafeState">

              <small>
                Navegador Electron criado. Se a área permanecer branca, a própria página pode estar bloqueando conteúdo incorporado.
              </small>

            </div>
          )}


          {phase ===
            "error" && (
            <div className="animeSourceViewerSafeState error">

              <strong>
                ⚠️ Não foi possível abrir dentro do Campfire.
              </strong>


              <small>
                {error}
              </small>

            </div>
          )}

        </div>


        <footer className="animeSourceViewerSafeFooter">

          <span>
            {url}
          </span>


          <small>
            Não redimensione a janela durante este primeiro teste.
          </small>

        </footer>

      </section>

    </div>
  );
}


export default AnimeSourceWebview;
