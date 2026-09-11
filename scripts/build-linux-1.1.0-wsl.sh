#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="1.1.0"
NODE_VERSION="v22.16.0"

fail() {
  echo "[ERRO] $*" >&2
  exit 1
}

if [[ $# -ne 2 ]]; then
  fail "Uso: build-linux-1.1.0-wsl.sh <fonte-staging> <release-destino>"
fi

STAGED_SOURCE="$1"
WINDOWS_RELEASE="$2"
[[ -d "$STAGED_SOURCE" ]] || fail "Fonte staging nao encontrada: $STAGED_SOURCE"
mkdir -p "$WINDOWS_RELEASE"

if ! command -v curl >/dev/null 2>&1; then
  fail "curl nao encontrado no WSL. Instale curl e tente novamente."
fi
if ! command -v tar >/dev/null 2>&1; then
  fail "tar nao encontrado no WSL."
fi

NODE_OK=0
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [[ "$NODE_MAJOR" -ge 22 ]]; then
    NODE_OK=1
  fi
fi

if [[ "$NODE_OK" -ne 1 ]]; then
  NODE_HOME="$HOME/.cache/campfire-node-${NODE_VERSION}-linux-x64"
  NODE_ARCHIVE="$HOME/.cache/node-${NODE_VERSION}-linux-x64.tar.xz"
  mkdir -p "$HOME/.cache"
  if [[ ! -x "$NODE_HOME/bin/node" ]]; then
    echo "[INFO] Instalando Node.js ${NODE_VERSION} localmente no WSL (sem alterar o sistema)..."
    rm -rf "$NODE_HOME"
    curl -fL --retry 3 --connect-timeout 20 \
      "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz" \
      -o "$NODE_ARCHIVE"
    tar -xJf "$NODE_ARCHIVE" -C "$HOME/.cache"
    mv "$HOME/.cache/node-${NODE_VERSION}-linux-x64" "$NODE_HOME"
  fi
  export PATH="$NODE_HOME/bin:$PATH"
fi

echo "[PASS] Node Linux: $(node --version)"
echo "[PASS] npm Linux:  $(npm --version)"

if ! command -v rpm >/dev/null 2>&1; then
  echo "[INFO] rpm nao encontrado. Tentando instalar o ferramental RPM no WSL..."
  if command -v apt-get >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
    if sudo -n true >/dev/null 2>&1; then
      sudo -n apt-get update
      sudo -n apt-get install -y rpm
    else
      echo "[INFO] O WSL pode solicitar a sua senha Linux apenas para instalar o pacote rpm."
      sudo apt-get update
      sudo apt-get install -y rpm
    fi
  else
    fail "rpm nao encontrado e nao foi possivel instalar automaticamente."
  fi
fi

WORK="$HOME/.cache/campfire-${VERSION}-linux-build-$$"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK"
cp -a "$STAGED_SOURCE"/. "$WORK"/
cd "$WORK"
rm -rf node_modules dist release
mkdir -p release

if [[ -f .campfire-public.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source ./.campfire-public.env
  set +a
fi

[[ -n "${VITE_SUPABASE_URL:-}" ]] || fail "VITE_SUPABASE_URL ausente no staging Linux."
[[ -n "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" ]] || fail "VITE_SUPABASE_PUBLISHABLE_KEY ausente no staging Linux."

echo "[1/8] npm ci Linux..."
npm ci --no-audit --no-fund

echo "[2/8] Verificacao completa Linux..."
npm run verify

export CSC_IDENTITY_AUTO_DISCOVERY=false
BUILDER="./node_modules/.bin/electron-builder"
[[ -x "$BUILDER" ]] || fail "electron-builder Linux nao encontrado apos npm ci."

echo "[3/8] Gerando RPM x86_64..."
"$BUILDER" --linux rpm --x64

echo "[4/8] Gerando AppImage x86_64..."
"$BUILDER" --linux AppImage --x64

mapfile -t RPM_FILES < <(find release -maxdepth 1 -type f -name '*.rpm' -print)
mapfile -t APPIMAGE_FILES < <(find release -maxdepth 1 -type f -name '*.AppImage' -print)
[[ ${#RPM_FILES[@]} -eq 1 ]] || fail "Esperado 1 RPM; encontrados ${#RPM_FILES[@]}."
[[ ${#APPIMAGE_FILES[@]} -eq 1 ]] || fail "Esperado 1 AppImage; encontrados ${#APPIMAGE_FILES[@]}."

RPM_FINAL="release/Campfire-${VERSION}-linux-x86_64.rpm"
APPIMAGE_FINAL="release/Campfire-${VERSION}-linux-x86_64.AppImage"
if [[ "${RPM_FILES[0]}" != "$RPM_FINAL" ]]; then mv -f "${RPM_FILES[0]}" "$RPM_FINAL"; fi
if [[ "${APPIMAGE_FILES[0]}" != "$APPIMAGE_FINAL" ]]; then mv -f "${APPIMAGE_FILES[0]}" "$APPIMAGE_FINAL"; fi

echo "[5/8] Gerando e validando checksums Linux..."
node scripts/verify-release-artifacts.mjs --platform linux --write-checksums

echo "[6/8] Inspecionando metadados RPM..."
{
  echo "=== rpm -qip ==="
  rpm -qip "$RPM_FINAL"
  echo
  echo "=== rpm -qlp ==="
  rpm -qlp "$RPM_FINAL"
} > release/linux-rpm-metadata.txt
cat release/linux-rpm-metadata.txt

echo "[7/8] Inspecionando e testando AppImage..."
file "$APPIMAGE_FINAL" | tee release/linux-appimage-file.txt
chmod +x "$APPIMAGE_FINAL"
set +e
APPIMAGE_EXTRACT_AND_RUN=1 timeout 20s "$APPIMAGE_FINAL" --no-sandbox > release/linux-appimage-smoke.log 2>&1
SMOKE_STATUS=$?
set -e
{
  echo
  echo "SmokeExitCode=$SMOKE_STATUS"
} >> release/linux-appimage-smoke.log
if [[ "$SMOKE_STATUS" -eq 126 || "$SMOKE_STATUS" -eq 127 ]]; then
  cat release/linux-appimage-smoke.log >&2
  fail "AppImage nao conseguiu iniciar/executar (exit $SMOKE_STATUS)."
fi
if grep -Eqi 'error while loading shared libraries|cannot execute|exec format error' release/linux-appimage-smoke.log; then
  cat release/linux-appimage-smoke.log >&2
  fail "AppImage apresentou erro de loader/arquitetura."
fi

echo "[8/8] Copiando artefatos Linux para a pasta release do Windows..."
cp -f "$RPM_FINAL" "$RPM_FINAL.sha256.txt" "$WINDOWS_RELEASE"/
cp -f "$APPIMAGE_FINAL" "$APPIMAGE_FINAL.sha256.txt" "$WINDOWS_RELEASE"/
cp -f release/linux-rpm-metadata.txt release/linux-appimage-file.txt release/linux-appimage-smoke.log "$WINDOWS_RELEASE"/

echo "[PASS] Linux 1.1.0: RPM + AppImage x86_64 gerados e inspecionados."
