import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  Session,
} from "@supabase/supabase-js";

import {
  listen,
} from "./desktop";

import {
  supabase,
} from "./lib/supabase";

import AuthScreen from "./AuthScreen";

import ProfileSetup, {
  type CampfireProfile,
} from "./ProfileSetup";

import CampfireHome from "./CampfireHome";
import GuestCampfire from "./GuestCampfire";
import WebInstallControls from "./web/WebInstallControls";

import {
  isCampfireDesktop,
  installCampfireRuntimeMarker,
  webInviteToken,
  webOAuthCallbackUrl,
} from "./web/platform";

import "./App.css";
import campfireIcon from "./assets/campfire-icon.png";

function App() {
  useEffect(() => {
    installCampfireRuntimeMarker();
  }, []);

  /*
   * =========================================================
   * AUTH
   * =========================================================
   */

  const [
    session,
    setSession,
  ] =
    useState<Session | null>(
      null
    );

  const [
    authReady,
    setAuthReady,
  ] =
    useState(false);

  const [
    authMessage,
    setAuthMessage,
  ] =
    useState("");

  const [
    authError,
    setAuthError,
  ] =
    useState("");

  const processingCode =
    useRef(false);

  /*
   * =========================================================
   * PROFILE
   * =========================================================
   */

  const [
    profile,
    setProfile,
  ] =
    useState<CampfireProfile | null>(
      null
    );

  const [
    profileReady,
    setProfileReady,
  ] =
    useState(false);

  const [
    profileError,
    setProfileError,
  ] =
    useState("");

  /*
   * =========================================================
   * GOOGLE CALLBACK
   * =========================================================
   */

  useEffect(() => {
    let destroyed =
      false;

    let unlisten:
      | (() => void)
      | undefined;

    async function processCallback(
      callbackUrl:
        string
    ) {
      if (
        processingCode.current
      ) {
        return;
      }

      let url:
        URL;

      try {
        url =
          new URL(
            callbackUrl
          );
      } catch {
        return;
      }

      const isDesktopCallback =
        url.hostname === "127.0.0.1" &&
        url.port === "54321" &&
        url.pathname === "/auth/callback";

      const isWebCallback =
        !isCampfireDesktop() &&
        url.origin === window.location.origin &&
        url.pathname === "/auth/callback";

      if (!isDesktopCallback && !isWebCallback) {
        return;
      }

      const oauthError =
        url.searchParams.get(
          "error"
        );

      const oauthDescription =
        url.searchParams.get(
          "error_description"
        );

      if (
        oauthError ||
        oauthDescription
      ) {
        setAuthMessage(
          ""
        );

        setAuthError(
          oauthDescription ||
          oauthError ||
          "Erro no login Google."
        );

        return;
      }

      const code =
        url.searchParams.get(
          "code"
        );

      if (!code) {
        setAuthMessage(
          ""
        );

        setAuthError(
          "O callback chegou sem código de autenticação."
        );

        return;
      }

      processingCode.current =
        true;

      setAuthError(
        ""
      );

      setAuthMessage(
        "Google autorizado. Entrando no Campfire..."
      );

      const flowId =
        url.searchParams.get(
          "sb_flow_id"
        ) ||
        localStorage.getItem(
          "campfire.oauth.flowId"
        );

      try {
        const {
          data,
          error,
        } =
          flowId
            ? await supabase.auth
                .exchangeCodeForSession(
                  code,
                  {
                    flowId,
                  }
                )
            : await supabase.auth
                .exchangeCodeForSession(
                  code
                );

        if (error) {
          throw error;
        }

        if (
          !data.session
        ) {
          throw new Error(
            "O Supabase não retornou uma sessão."
          );
        }

        localStorage.removeItem(
          "campfire.oauth.flowId"
        );

        if (!destroyed) {
          setSession(
            data.session
          );

          setAuthMessage(
            ""
          );

          setAuthError(
            ""
          );
        }
      } catch (
        error
      ) {
        console.error(
          "Erro concluindo login:",
          error
        );

        if (!destroyed) {
          setAuthMessage(
            ""
          );

          setAuthError(
            error instanceof
              Error
              ? error.message
              : "Não foi possível concluir o login."
          );
        }
      } finally {
        processingCode.current =
          false;
      }
    }

    async function initialize() {
      /*
       * Registra listener antes
       * de consultar a sessão.
       */

      unlisten =
        await listen<string>(
          "campfire-auth-callback",
          (
            event
          ) => {
            void processCallback(
              event.payload
            );
          }
        );

      const browserCallback =
        webOAuthCallbackUrl();

      if (browserCallback) {
        await processCallback(browserCallback);
        window.history.replaceState({}, "", "/");
      }

      const {
        data,
        error,
      } =
        await supabase.auth
          .getSession();

      if (error) {
        console.error(
          "Erro lendo sessão:",
          error
        );
      }

      if (
        !destroyed &&
        data.session
      ) {
        setSession(
          data.session
        );
      }

      if (!destroyed) {
        setAuthReady(
          true
        );
      }
    }

    void initialize();

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth
        .onAuthStateChange(
          (
            event,
            currentSession
          ) => {
            if (
              destroyed
            ) {
              return;
            }

            if (
              currentSession
            ) {
              setSession(
                currentSession
              );

              setAuthMessage(
                ""
              );

              setAuthError(
                ""
              );
            }

            if (
              event ===
              "SIGNED_OUT"
            ) {
              setSession(
                null
              );

              setProfile(
                null
              );

              setProfileReady(
                false
              );
            }
          }
        );

    return () => {
      destroyed =
        true;

      subscription.unsubscribe();

      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  /*
   * =========================================================
   * PROFILE
   * =========================================================
   */

  useEffect(() => {
    let cancelled =
      false;

    async function loadProfile() {
      if (!session || session.user.is_anonymous) {
        setProfile(
          null
        );

        setProfileReady(
          true
        );

        return;
      }

      setProfileReady(
        false
      );

      setProfileError(
        ""
      );

      try {
        const {
          data,
          error,
        } =
          await supabase
            .from(
              "profiles"
            )
            .select(
              `
                id,
                username,
                display_name,
                avatar_url,
                status
              `
            )
            .eq(
              "id",
              session.user.id
            )
            .maybeSingle();

        if (error) {
          throw error;
        }

        if (
          data &&
          !cancelled
        ) {
          setProfile(
            data as CampfireProfile
          );

          setProfileReady(
            true
          );

          return;
        }

        /*
         * Fallback caso o trigger
         * não tenha criado o perfil.
         */

        const googleName =
          session.user
            .user_metadata
            ?.full_name ||
          session.user
            .user_metadata
            ?.name ||
          null;

        const googleAvatar =
          session.user
            .user_metadata
            ?.avatar_url ||
          session.user
            .user_metadata
            ?.picture ||
          null;

        const {
          data:
            createdProfile,

          error:
            createError,
        } =
          await supabase
            .from(
              "profiles"
            )
            .upsert(
              {
                id:
                  session.user.id,

                display_name:
                  googleName,

                avatar_url:
                  googleAvatar,

                status:
                  "online",
              },
              {
                onConflict:
                  "id",
              }
            )
            .select(
              `
                id,
                username,
                display_name,
                avatar_url,
                status
              `
            )
            .single();

        if (
          createError
        ) {
          throw createError;
        }

        if (
          !createdProfile
        ) {
          throw new Error(
            "Não foi possível criar o perfil Campfire."
          );
        }

        if (!cancelled) {
          setProfile(
            createdProfile as CampfireProfile
          );
        }
      } catch (
        error
      ) {
        console.error(
          "Erro carregando perfil:",
          error
        );

        if (
          !cancelled
        ) {
          setProfileError(
            error instanceof
              Error
              ? error.message
              : "Não foi possível carregar seu perfil."
          );
        }
      } finally {
        if (
          !cancelled
        ) {
          setProfileReady(
            true
          );
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled =
        true;
    };
  }, [
    session?.user.id,
  ]);

  /*
   * =========================================================
   * ROUTING
   * =========================================================
   */

  if (!authReady) {
    return (
      <CampfireLoading
        text="Abrindo Campfire..."
      />
    );
  }

  const inviteToken =
    !isCampfireDesktop()
      ? webInviteToken()
      : null;

  if (inviteToken) {
    return (
      <>
        <GuestCampfire token={inviteToken} />
        <WebInstallControls />
      </>
    );
  }

  if (!session || session.user.is_anonymous) {
    return (
      <>
        <AuthScreen
          authMessage={authMessage}
          authError={authError}
        />
        <WebInstallControls />
      </>
    );
  }

  if (!profileReady) {
    return (
      <CampfireLoading
        text="Carregando seu perfil..."
      />
    );
  }

  if (
    !profile &&
    profileError
  ) {
    return (
      <ProfileError
        message={
          profileError
        }
      />
    );
  }

  if (
    profile &&
    !profile.username
  ) {
    return (
      <ProfileSetup
        session={
          session
        }
        profile={
          profile
        }
        onComplete={(
          updatedProfile
        ) => {
          setProfile(
            updatedProfile
          );
        }}
      />
    );
  }

  if (!profile) {
    return (
      <CampfireLoading
        text="Preparando Campfire..."
      />
    );
  }

  return (
    <>
      <CampfireHome profile={profile} />
      <WebInstallControls allowNotifications />
    </>
  );
}

/*
 * ============================================================
 * LOADING
 * ============================================================
 */

function CampfireLoading({
  text,
}: {
  text:
    string;
}) {
  return (
    <div
      style={{
        width:
          "100vw",

        height:
          "100vh",

        display:
          "grid",

        placeItems:
          "center",

        background:
          "radial-gradient(circle at top, #2f343e 0%, #14171c 35%, #090a0d 100%)",

        fontFamily:
          '"Segoe UI", Arial, sans-serif',

        color:
          "#f0f3f6",
      }}
    >
      <div
        style={{
          textAlign:
            "center",
        }}
      >
        <img
          src={campfireIcon}
          alt="Campfire"
          style={{
            width: "84px",
            height: "84px",
            marginBottom: "10px",
            filter: "drop-shadow(0 8px 22px rgba(255,130,40,.25))",
          }}
        />

        <div style={{ fontSize: "14px", letterSpacing: ".04em" }}>{text}</div>
      </div>
    </div>
  );
}

/*
 * ============================================================
 * PROFILE ERROR
 * ============================================================
 */

function ProfileError({
  message,
}: {
  message:
    string;
}) {
  return (
    <div
      style={{
        height:
          "100vh",

        display:
          "grid",

        placeItems:
          "center",

        background:
          "radial-gradient(circle at top, #2f343e 0%, #14171c 35%, #090a0d 100%)",

        fontFamily:
          '"Segoe UI", Arial, sans-serif',
      }}
    >
      <div
        style={{
          width:
            "420px",

          maxWidth:
            "90%",

          padding:
            "30px",

          border:
            "1px solid #dfb0b0",

          borderRadius:
            "12px",

          background:
            "linear-gradient(180deg, rgba(40,43,50,.96), rgba(14,16,19,.98))",

          textAlign:
            "center",

          boxShadow: "0 18px 50px rgba(0,0,0,.45)",

          color:
            "#f3d3d3",
        }}
      >
        <img
          src={campfireIcon}
          alt="Campfire"
          style={{
            width: "86px",
            height: "86px",
            marginBottom: "8px",
            filter: "drop-shadow(0 8px 22px rgba(255,130,40,.25))",
          }}
        />

        <h2>
          Não foi possível carregar
          o perfil
        </h2>

        <p>
          {message}
        </p>

        <button
          onClick={() =>
            window.location.reload()
          }
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export default App;