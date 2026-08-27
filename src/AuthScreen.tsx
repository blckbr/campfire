import { useState } from "react";
import { openUrl } from "./desktop";

import { supabase } from "./lib/supabase";
import "./AuthScreen.css";
import campfireIcon from "./assets/campfire-icon.png";

type Props = {
  authMessage?: string;
  authError?: string;
};

function AuthScreen({
  authMessage = "",
  authError = "",
}: Props) {
  const [loading, setLoading] =
    useState(false);

  const [localMessage, setLocalMessage] =
    useState("");

  const [localError, setLocalError] =
    useState("");

  async function loginWithGoogle() {
    try {
      setLoading(true);

      setLocalMessage("");
      setLocalError("");

      const {
        data,
        error,
      } =
        await supabase.auth
          .signInWithOAuth({
            provider: "google",

            options: {
              /*
               * NOVO CALLBACK:
               *
               * Não usamos mais
               * campfire://
               *
               * nem localhost:1420.
               */
              redirectTo:
                "http://127.0.0.1:54321/auth/callback",

              skipBrowserRedirect:
                true,

              queryParams: {
                prompt:
                  "select_account",
              },
            },
          });

      if (error) {
        throw error;
      }

      if (!data.url) {
        throw new Error(
          "O Supabase não retornou a URL do Google."
        );
      }

      /*
       * Salva o flowId PKCE.
       */
      if (data.flowId) {
        localStorage.setItem(
          "campfire.oauth.flowId",
          data.flowId
        );
      }

      setLocalMessage(
        "Aguardando autenticação do Google..."
      );

      await openUrl(
        data.url
      );
    } catch (error) {
      console.error(error);

      setLocalError(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir o Google."
      );
    } finally {
      setLoading(false);
    }
  }

  const message =
    authMessage ||
    localMessage;

  const error =
    authError ||
    localError;

  return (
    <div className="authPage">
      <div className="authGlow authGlowOne" />
      <div className="authGlow authGlowTwo" />

      <div className="authCard">
        <div className="authBrand">
          <div className="authFire">
            <img
              src={campfireIcon}
              alt="Campfire"
              className="authBrandLogo"
            />
          </div>

          <h1>
            Campfire
          </h1>

          <p>
            Reúna seus amigos.
            Converse, jogue e compartilhe.
          </p>
        </div>

        <button
          className="googleButton"
          onClick={loginWithGoogle}
          disabled={loading}
        >
          <span className="googleLogo">
            G
          </span>

          {loading
            ? "Abrindo Google..."
            : "Continuar com Google"}
        </button>

        <div className="authDivider">
          <span />
          <small>ou</small>
          <span />
        </div>

        <button
          className="emailLoginPlaceholder"
          disabled
        >
          Entrar com e-mail
        </button>

        <small className="comingSoon">
          Login por e-mail será
          ativado em seguida.
        </small>

        {message && !error && (
          <div className="authMessage">
            {message}
          </div>
        )}

        {error && (
          <div
            className="authMessage"
            style={{
              background:
                "#fff1f1",

              borderColor:
                "#d89494",

              color:
                "#983e3e",
            }}
          >
            {error}
          </div>
        )}

        <div className="authFooter">
          Campfire 1.0.0
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;