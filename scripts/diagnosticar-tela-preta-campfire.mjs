import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const logPath = path.join(root, "CAMPFIRE_TELA_PRETA_DIAGNOSTICO.log");
const electronExe = path.join(root, "node_modules", "electron", "dist", "electron.exe");

let vite = null;
let electron = null;
let ws = null;
let nextId = 1;
const pending = new Map();
const runtimeEvents = [];
const mainOutput = [];

function line(text = "") {
  const msg = `[${new Date().toISOString()}] ${text}`;
  console.log(msg);
  fs.appendFileSync(logPath, msg + "\r\n", "utf8");
}

function stop(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === "win32" && child.pid) {
      spawn(process.env.ComSpec || "cmd.exe",
        ["/d", "/s", "/c", `taskkill /pid ${child.pid} /t /f >nul 2>nul`],
        { stdio: "ignore", windowsHide: true }
      );
    } else {
      child.kill("SIGTERM");
    }
  } catch {}
}

function portFree(port) {
  return new Promise((resolve) => {
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
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Timeout aguardando ${url}`);
}

async function waitTargets(cdpPort, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(`http://127.0.0.1:${cdpPort}/json`);
      const targets = await r.json();
      const page = targets.find(t => t.type === "page" && /127\.0\.0\.1|file:/i.test(t.url || ""))
        || targets.find(t => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
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
  const result = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result?.result?.result?.value;
}

function fmtException(event) {
  const d = event?.params?.exceptionDetails || {};
  const ex = d.exception?.description || d.text || "Excecao sem descricao";
  const url = d.url || "";
  const lineNo = Number.isFinite(d.lineNumber) ? d.lineNumber + 1 : "";
  const colNo = Number.isFinite(d.columnNumber) ? d.columnNumber + 1 : "";
  return `${ex}${url ? ` | ${url}:${lineNo}:${colNo}` : ""}`;
}

async function main() {
  fs.writeFileSync(logPath,
`CAMPFIRE - DIAGNOSTICO DE TELA PRETA
Data: ${new Date().toISOString()}
Raiz: ${root}

`, "utf8");

  line(`Node ${process.version}`);
  line(`Electron existe: ${fs.existsSync(electronExe)}`);
  if (!fs.existsSync(electronExe)) {
    throw new Error("electron.exe ausente. Execute npm install antes do diagnostico.");
  }

  const vitePort = await choosePort(1420, 1440);
  const cdpPort = await choosePort(9333, 9360);
  const devUrl = `http://127.0.0.1:${vitePort}`;
  line(`Vite: ${devUrl}`);
  line(`CDP: 127.0.0.1:${cdpPort}`);

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  vite = spawn(npmCmd, ["run", "dev:web"], {
    cwd: root,
    env: { ...process.env, CAMPFIRE_VITE_PORT: String(vitePort) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stdout.on("data", d => line("[VITE] " + String(d).trimEnd()));
  vite.stderr.on("data", d => line("[VITE-ERR] " + String(d).trimEnd()));

  await waitHttp(devUrl, 60000);
  line("Vite respondeu HTTP 200.");

  electron = spawn(electronExe, [`--remote-debugging-port=${cdpPort}`, "."], {
    cwd: root,
    env: {
      ...process.env,
      CAMPFIRE_DEV_URL: devUrl,
      ELECTRON_ENABLE_LOGGING: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  electron.stdout.on("data", d => {
    const s = String(d).trimEnd();
    mainOutput.push(s);
    line("[ELECTRON] " + s);
  });
  electron.stderr.on("data", d => {
    const s = String(d).trimEnd();
    mainOutput.push(s);
    line("[ELECTRON-ERR] " + s);
  });

  const target = await waitTargets(cdpPort);
  line(`Target: title="${target.title}" url="${target.url}"`);

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  ws.addEventListener("message", (event) => {
    let msg;
    try { msg = JSON.parse(String(event.data)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg);
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

  line("Aguardando inicializacao do React por 8 segundos...");
  await new Promise(r => setTimeout(r, 8000));

  const snapshot = await evaluate(`(() => {
    const root = document.getElementById('root');
    const overlay = document.querySelector('vite-error-overlay');
    const overlayText = overlay?.shadowRoot?.textContent || overlay?.textContent || '';
    const resourceEntries = performance.getEntriesByType('resource').map(r => ({
      name: r.name,
      duration: Math.round(r.duration),
      transferSize: r.transferSize
    })).slice(-80);
    return {
      readyState: document.readyState,
      title: document.title,
      href: location.href,
      bodyText: (document.body?.innerText || '').slice(0, 1500),
      rootExists: !!root,
      rootChildren: root?.childElementCount ?? -1,
      rootHtml: (root?.innerHTML || '').slice(0, 3000),
      bridgePresent: !!window.campfireDesktop,
      overlayText: overlayText.slice(0, 5000),
      resourceEntries
    };
  })()`);

  line("=== SNAPSHOT DO RENDERER ===");
  line(JSON.stringify(snapshot, null, 2));

  const mainTsStatus = await fetch(`${devUrl}/src/main.tsx`).then(r => r.status).catch(() => -1);
  line(`HTTP /src/main.tsx = ${mainTsStatus}`);

  line("=== EVENTOS RUNTIME/CONSOLE ===");
  if (!runtimeEvents.length) line("(nenhum evento capturado depois da conexao CDP)");
  for (const e of runtimeEvents) line(`${e.type}: ${e.text}`);

  const diagnosis = [];
  if (snapshot?.overlayText) diagnosis.push("Vite exibiu um erro de compilacao/runtime.");
  if (snapshot?.rootExists && snapshot.rootChildren === 0) {
    diagnosis.push("index.html carregou, mas #root ficou vazio: React nao montou ou desmontou apos uma excecao.");
  }
  if (!snapshot?.bridgePresent) {
    diagnosis.push("window.campfireDesktop ausente: preload/bridge nao ficou disponivel.");
  }
  if (runtimeEvents.some(e => e.type === "exception")) {
    diagnosis.push("Ha excecao JavaScript capturada pelo Runtime.");
  }
  if (mainTsStatus !== 200) {
    diagnosis.push("Vite nao conseguiu servir /src/main.tsx corretamente.");
  }
  if (!diagnosis.length && snapshot?.rootChildren > 0) {
    diagnosis.push("Nesta execucao controlada o React montou conteudo; o problema pode depender da forma como a instancia anterior foi reaberta.");
  }

  line("=== DIAGNOSTICO AUTOMATICO ===");
  for (const d of diagnosis) line("- " + d);

  line("Coleta concluida. A instancia de diagnostico sera encerrada agora.");
  return 0;
}

let code = 0;
try {
  code = await main();
} catch (error) {
  line("FALHA DO DIAGNOSTICO: " + (error?.stack || error));
  code = 1;
} finally {
  try { ws?.close(); } catch {}
  stop(electron);
  stop(vite);
  await new Promise(r => setTimeout(r, 700));
}

process.exit(code);
