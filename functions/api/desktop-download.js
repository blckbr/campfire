const GITHUB_API = "https://api.github.com";
const DEFAULT_REPOSITORY = "blckbr/campfire";
const RELEASE_TAG = "v1.1.0";
const CACHE_SECONDS = 300;
const ASSETS = Object.freeze({
  windowsSetup: "Campfire-Setup-1.1.0-x64.exe",
  windowsPortable: "Campfire-Portable-1.1.0-x64.exe",
  linuxRpm: "Campfire-1.1.0-linux-x86_64.rpm",
  linuxAppImage: "Campfire-1.1.0-linux-x86_64.AppImage",
});

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "CampfireWeb/1.1 (+https://campfireweb.pages.dev/)",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function redirect(location, cache = true) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": cache
        ? `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`
        : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function text(message, status) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequestGet(context) {
  const repository = String(context.env.CAMPFIRE_GITHUB_REPO || DEFAULT_REPOSITORY).trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return text("O repositório configurado para o Campfire Desktop é inválido.", 503);
  }

  const requestUrl = new URL(context.request.url);
  const asset = requestUrl.searchParams.get("asset") || "windowsSetup";
  const expectedFilename = ASSETS[asset];
  if (!expectedFilename) {
    return text("asset inválido. Escolha windowsSetup, windowsPortable, linuxRpm ou linuxAppImage.", 400);
  }

  const releasesUrl = `https://github.com/${repository}/releases`;
  try {
    const response = await fetch(`${GITHUB_API}/repos/${repository}/releases/latest`, {
      headers: githubHeaders(),
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    if (!response.ok) return redirect(releasesUrl, false);

    const release = await response.json();
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    const selected = assets.find((candidate) =>
      candidate?.name === expectedFilename && typeof candidate?.browser_download_url === "string"
    );

    if (!selected) return redirect(releasesUrl, false);
    return redirect(selected.browser_download_url, true);
  } catch {
    return redirect(releasesUrl, false);
  }
}
