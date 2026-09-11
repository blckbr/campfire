const CAMPFIRE_DOWNLOAD_ENDPOINT = "https://campfireweb.pages.dev/api/desktop-download";

window.CAMPFIRE_DOWNLOADS = Object.freeze({
  windowsSetup: `${CAMPFIRE_DOWNLOAD_ENDPOINT}?asset=windowsSetup`,
  windowsPortable: `${CAMPFIRE_DOWNLOAD_ENDPOINT}?asset=windowsPortable`,
  linuxRpm: `${CAMPFIRE_DOWNLOAD_ENDPOINT}?asset=linuxRpm`,
  linuxAppImage: `${CAMPFIRE_DOWNLOAD_ENDPOINT}?asset=linuxAppImage`
});

window.CAMPFIRE_SITE_CONFIG = Object.freeze({
  version: "1.1.0",
  githubUrl: "https://github.com/blckbr/campfire",
  releaseUrl: "https://github.com/blckbr/campfire/releases/tag/v1.1.0",
  campfireWebUrl: "https://campfireweb.pages.dev/",
  downloads: window.CAMPFIRE_DOWNLOADS
});

window.CAMPFIRE_REPOSITORY_URL = window.CAMPFIRE_SITE_CONFIG.githubUrl;
