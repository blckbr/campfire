import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const logPath = path.join(root, "CAMPFIRE_TELA_PRETA_DIAGNOSTICO_V2.log");
const electronExe = path.join(root, "node_modules", "electron", "dist", "electron.exe");
const comspec = process.env.ComSpec || process.env.COMSPEC || "C:\\Windows\\System32\\cmd.exe";

let vite = null;
let electron = null;
let ws = null;
let nextId = 1;
const pending = new Map();
const runtimeEvents = [];

function line(text = "") {
  const msg = `[${new Date().toISOString()}] ${text}`;
  console.log(msg);
  fs.appendFileSync(logPath, msg + "\r\n", "utf8");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stopTree(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {}
}

function stopExistingCampfireElectron() {
  if (process.platform !== "win32") return;
  const rootEscaped = root.replace(/'/g, "''");
  const ps = [
    "$ErrorActionPreference='SilentlyContinue'",
    `$root='${rootEscaped}'`,
    "$items=Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\"",
    "$items | Where-Object {",
    "  (([string]$_.ExecutablePath).StartsWith($root,[StringComparison]::OrdinalIgnoreCase)) -or",
    "  (([string]$_.CommandLine).IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0)",
    "} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join("; ");

  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
    { cwd: root, encoding: "utf8", windowsHide: true }
  );
  line(`Encerramento seletivo do Electron: exit=${r.status ?? -1}`);
  if (r.stderr?.trim()) line("[POWERSHELL-ERR] " + r.stderr.trim());
}

function portFree(port) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.unref();
    s.once("error", () => resolve(false));
    s.listen({ host: "127.0.0.1", port, exclusive: true }, () => s.close(() => resolve(true)));
  });
}

async function choosePort(from, to) {
  for (let p = from; p <= to; p++) {
    if (await portFree(p)) return p;
  }
  throw new Error(`Nenhuma porta livre entre ${from} e ${to}`);
}

async function waitHttp(url, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Timeout aguardando ${url}`);
}

async function waitTargets(cdpPort, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(`http://127.0.0.1:${cdpPort}/json`);
      const targets = await r.json();
      const page =
        targets.find(t => t.type === "page" && /127\.0\.0\.1|file:/i.test(t.url || "")) ||
        targets.find(t => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error("DevTools remoto nao apresentou o target da pagina.");
}

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 7000);
  });
}

async function evaluate(expression) {
  const response = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return response?.result?.result?.value;
}

function fmtException(msg) {
  const d = msg?.params?.exceptionDetails || {};
  const description = d.exception?.description || d.text || "Excecao sem descricao";
  const url = d.url || "";
  const lineNo = Number.isFinite(d.lineNumber) ? d.lineNumber + 1 : "";
  const colNo = Number.isFinite(d.columnNumber) ? d.columnNumber + 1 : "";
  return `${description}${url ? ` | ${url}:${lineNo}:${colNo}` : ""}`;
}

async function main() {
  fs.writeFileSync(
    logPath,
    `CAMPFIRE - DIAGNOSTICO DE TELA PRETA V2\r\nData: ${new Date().toISOString()}\r\nRaiz: ${root}\r\n\r\n`,
    "utf8"
  );

  line(`Node ${process.version}`);
  line(`ComSpec: ${comspec}`);
  line(`electron.exe existe: ${fs.existsSync(electronExe)}`);

  if (!fs.existsSync(electronExe)) {
    throw new Error("electron.exe ausente em node_modules\\electron\\dist.");
  }

  line("Encerrando somente instancias Electron vinculadas a esta raiz...");
  stopExistingCampfireElectron();
  await sleep(1500);

  const vitePort = await choosePort(1420, 1440);
  const cdpPort = await choosePort(9333, 9360);
  const devUrl = `http://127.0.0.1:${vitePort}`;

  line(`Vite: ${devUrl}`);
  line(`CDP: http://127.0.0.1:${cdpPort}`);

  // Windows + Node 24: execute npm through cmd.exe, not spawn("npm.cmd")
  const viteCommand = `npm run dev:web -- --port ${vitePort} --strictPort`;
  line(`Iniciando Vite via cmd.exe: ${viteCommand}`);

  vite = spawn(
    comspec,
    ["/d", "/s", "/c", viteCommand],
    {
      cwd: root,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  vite.stdout.on("data", d => line("[VITE] " + String(d).trimEnd()));
  vite.stderr.on("data", d => line("[VITE-ERR] " + String(d).trimEnd()));
  vite.on("error", e => line("[VITE-SPAWN-ERR] " + (e?.stack || e)));

  await waitHttp(devUrl, 60000);
  line("Vite respondeu HTTP 200.");

  line("Iniciando Electron com remote debugging...");
  electron = spawn(
    electronExe,
    [`--remote-debugging-port=${cdpPort}`, "."],
    {
      cwd: root,
      env: {
        ...process.env,
        CAMPFIRE_DEV_URL: devUrl,
        ELECTRON_ENABLE_LOGGING: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
    }
  );

  electron.stdout.on("data", d => line("[ELECTRON] " + String(d).trimEnd()));
  electron.stderr.on("data", d => line("[ELECTRON-ERR] " + String(d).trimEnd()));
  electron.on("error", e => line("[ELECTRON-SPAWN-ERR] " + (e?.stack || e)));

  const target = await waitTargets(cdpPort, 30000);
  line(`Target: title="${target.title}" url="${target.url}"`);

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  ws.addEventListener("message", event => {
    let msg;
    try { msg = JSON.parse(String(event.data)); } catch { return; }

    if (msg.id && pending.has(msg.id)) {
      const item = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) item.reject(new Error(JSON.stringify(msg.error)));
      else item.resolve(msg);
      return;
    }

    if (msg.method === "Runtime.exceptionThrown") {
      runtimeEvents.push({ type: "exception", text: fmtException(msg) });
    }

    if (msg.method === "Runtime.consoleAPICalled") {
      const args = msg.params?.args || [];
      const text = args.map(a => a.value ?? a.description ?? "").join(" ");
      runtimeEvents.push({ type: `console:${msg.params?.type || "log"}`, text });
    }

    if (msg.method === "Log.entryAdded") {
      runtimeEvents.push({ type: "log", text: msg.params?.entry?.text || "" });
    }
  });

  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Page.enable");

  line("Aguardando 8 segundos para a montagem do React...");
  await sleep(8000);

  const snapshot = await evaluate(`(() => {
    const root = document.getElementById('root');
    const overlay = document.querySelector('vite-error-overlay');
    const overlayText =
      overlay?.shadowRoot?.textContent ||
      overlay?.textContent ||
      '';

    const resourceEntries = performance
      .getEntriesByType('resource')
      .map(r => ({
        name: r.name,
        duration: Math.round(r.duration),
        transferSize: r.transferSize
      }))
      .slice(-100);

    return {
      readyState: document.readyState,
      title: document.title,
      href: location.href,
      bodyText: (document.body?.innerText || '').slice(0, 2500),
      rootExists: !!root,
      rootChildren: root?.childElementCount ?? -1,
      rootHtml: (root?.innerHTML || '').slice(0, 5000),
      bridgePresent: !!window.campfireDesktop,
      overlayText: overlayText.slice(0, 8000),
      resourceEntries
    };
  })()`);

  line("=== SNAPSHOT DO RENDERER ===");
  line(JSON.stringify(snapshot, null, 2));

  let mainTsStatus = -1;
  try {
    mainTsStatus = (await fetch(`${devUrl}/src/main.tsx`)).status;
  } catch {}
  line(`HTTP /src/main.tsx = ${mainTsStatus}`);

  line("=== EVENTOS RUNTIME / CONSOLE ===");
  if (!runtimeEvents.length) {
    line("(nenhum evento capturado depois da conexao CDP)");
  } else {
    for (const e of runtimeEvents) line(`${e.type}: ${e.text}`);
  }

  const diagnosis = [];

  if (snapshot?.overlayText) {
    diagnosis.push("Vite exibiu um overlay de erro.");
  }
  if (snapshot?.rootExists && snapshot.rootChildren === 0) {
    diagnosis.push("#root existe, mas ficou vazio: React nao montou ou desmontou apos uma excecao.");
  }
  if (!snapshot?.bridgePresent) {
    diagnosis.push("window.campfireDesktop esta ausente: o preload/bridge nao foi exposto.");
  }
  if (runtimeEvents.some(e => e.type === "exception")) {
    diagnosis.push("Foi capturada pelo menos uma excecao JavaScript.");
  }
  if (mainTsStatus !== 200) {
    diagnosis.push("Vite nao serviu /src/main.tsx com HTTP 200.");
  }
  if (!diagnosis.length && snapshot?.rootChildren > 0) {
    diagnosis.push("Na execucao controlada o React montou; a tela preta depende do fluxo normal de reabertura/estado.");
  }

  line("=== DIAGNOSTICO AUTOMATICO ===");
  for (const item of diagnosis) line("- " + item);

  line("Coleta concluida.");
  return 0;
}

let exitCode = 0;

try {
  exitCode = await main();
} catch (error) {
  line("FALHA DO DIAGNOSTICO: " + (error?.stack || error));
  exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  stopTree(electron);
  stopTree(vite);
  await sleep(700);
}

process.exit(exitCode);
