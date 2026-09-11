const siteConfig = window.CAMPFIRE_SITE_CONFIG || {};
const downloads = window.CAMPFIRE_DOWNLOADS || siteConfig.downloads || {};
const repositoryUrl = String(siteConfig.githubUrl || window.CAMPFIRE_REPOSITORY_URL || "https://github.com/blckbr/campfire").replace(/\/$/, "");
const releaseUrl = String(siteConfig.releaseUrl || `${repositoryUrl}/releases/latest`);
const campfireWebUrl = String(siteConfig.campfireWebUrl || "#campfireweb");

const userAgent = String(navigator.userAgent || navigator.platform || "").toLowerCase();
const isLinux = /linux|x11/.test(userAgent) && !/android/.test(userAgent);
const isWindows = /windows|win32|win64/.test(userAgent);
const recommendedDownloadKind = isLinux ? "linuxRpm" : isWindows ? "windowsSetup" : null;

function validDownloadUrl(value) {
  return typeof value === "string" && /^(https?:\/\/|#)/i.test(value);
}

function downloadUrlFor(kind) {
  const value = downloads[kind];
  return validDownloadUrl(value) ? value : "#download";
}

document.querySelectorAll("[data-github-link]").forEach((el) => { el.href = repositoryUrl; });
document.querySelectorAll("[data-release-link]").forEach((el) => { el.href = releaseUrl; });
document.querySelectorAll("[data-campfireweb-link]").forEach((el) => { el.href = campfireWebUrl; });
document.querySelectorAll("[data-download-kind]").forEach((el) => {
  const kind = el.dataset.downloadKind;
  el.href = downloadUrlFor(kind);
  const recommended = kind === recommendedDownloadKind;
  el.classList.toggle("recommended", recommended);
  if (recommended) {
    el.setAttribute("aria-label", `${el.textContent.trim()} — recomendado para este sistema`);
    const badge = el.querySelector(".recommendation-label");
    if (badge) badge.textContent = "Recomendado";
  }
});

const genericDownloadUrl = recommendedDownloadKind
  ? downloadUrlFor(recommendedDownloadKind)
  : "#download";
document.querySelectorAll("[data-download-link]").forEach((el) => { el.href = genericDownloadUrl; });

const header = document.querySelector("#site-header");
const ambient = document.querySelector(".ambient-pointer");
window.addEventListener("scroll", () => header?.classList.toggle("scrolled", scrollY > 24), { passive: true });
window.addEventListener("pointermove", (event) => {
  if (!ambient) return;
  ambient.style.left = `${event.clientX}px`;
  ambient.style.top = `${event.clientY}px`;
}, { passive: true });

const realFire = document.querySelector("#real-fire-video");
const fireApexName = document.querySelector("#fire-apex-name");
const fireStage = document.querySelector("#fire-stage");
const sparkLayer = document.querySelector("#spark-layer");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (realFire) {
  realFire.muted = true;
  if (reduceMotion) realFire.pause();
  else realFire.play().catch(() => {});
}
let energy = 0;
let target = 0;
let last = performance.now();

function applyFireEnergy() {
  const scaleY = 1 + energy * 0.62;
  const scaleX = 1 + energy * 0.045;
  if (realFire) {
    realFire.style.transform = `translateX(-50%) scaleX(${scaleX.toFixed(3)}) scaleY(${scaleY.toFixed(3)})`;
    realFire.style.filter = `brightness(${(1.04 + energy * .34).toFixed(2)}) saturate(${(1.10 + energy * .28).toFixed(2)}) contrast(${(1.05 + energy * .08).toFixed(2)}) drop-shadow(0 0 ${18 + energy * 34}px rgba(255,89,0,${.36 + energy * .31}))`;
    realFire.playbackRate = 1 + energy * .16;
  }
  const nameLevel = Math.max(0, Math.min(1, (energy - .43) / .25));
  fireApexName?.style.setProperty("--name-level", nameLevel.toFixed(3));
  fireStage?.classList.toggle("is-apex", nameLevel > .68);
  fireStage?.style.setProperty("--fire-energy", energy.toFixed(3));
  document.documentElement.style.setProperty("--fire-energy", energy.toFixed(3));
}

function tick(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  target += (0 - target) * Math.min(1, dt * .55);
  energy += (target - energy) * Math.min(1, dt * 5.5);
  applyFireEnergy();
  requestAnimationFrame(tick);
}
if (!reduceMotion) requestAnimationFrame(tick);

function spawnSpark(x, y, amount = 1) {
  if (!sparkLayer || reduceMotion) return;
  for (let i = 0; i < amount; i += 1) {
    const spark = document.createElement("i");
    spark.className = `spark${Math.random() > .78 ? " big" : ""}`;
    spark.style.left = `${x + (Math.random() - .5) * 80}px`;
    spark.style.top = `${y + (Math.random() - .5) * 32}px`;
    spark.style.setProperty("--x", `${(Math.random() - .5) * 110}px`);
    spark.style.setProperty("--y", `${-90 - Math.random() * 210}px`);
    spark.style.setProperty("--d", `${.8 + Math.random() * 1.2}s`);
    sparkLayer.appendChild(spark);
    setTimeout(() => spark.remove(), 2200);
  }
}

document.addEventListener("pointerdown", (event) => {
  const interactive = event.target.closest("a,button,input,select,textarea,dialog");
  if (interactive) return;
  target = Math.min(.92, target + .24);
  const rect = fireStage?.getBoundingClientRect();
  if (rect) spawnSpark(rect.left + rect.width * .5, rect.top + rect.height * .55, 10 + Math.round(target * 12));
});

if (!reduceMotion) setInterval(() => {
  const rect = fireStage?.getBoundingClientRect();
  if (!rect || rect.bottom < 0 || rect.top > innerHeight) return;
  spawnSpark(rect.left + rect.width * (.45 + Math.random() * .1), rect.top + rect.height * .56, Math.random() > .7 ? 2 : 1);
}, 420);

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add("visible"); });
}, { threshold: .12 });
document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

const dialog = document.querySelector("#preview-dialog");
const dialogImg = document.querySelector("#preview-image");
const dialogCaption = document.querySelector("#preview-caption");
function openPreview(button) {
  if (!dialog || !dialogImg) return;
  dialogImg.src = button.dataset.previewSrc || "";
  dialogImg.alt = button.dataset.preview || "Screenshot do Campfire";
  if (dialogCaption) dialogCaption.textContent = button.dataset.preview || "Campfire";
  dialog.showModal();
}
document.querySelectorAll("[data-preview-src]").forEach((button) => button.addEventListener("click", () => openPreview(button)));
dialog?.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
dialog?.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && dialog?.open) dialog.close(); });
