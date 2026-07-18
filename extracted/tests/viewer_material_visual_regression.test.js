const assert = require("node:assert/strict");
const test = require("node:test");

const cdpBaseUrl = "http://127.0.0.1:9222";
const materialFixtures = [
  "Characters/Kraken/Art/kraken.glb",
  "Characters/Hero023/Art/hero023_drow.glb",
  "Characters/SAW/Art/saw.glb",
  "Characters/Hero028/Art/hero028_poseidon.glb",
  "Characters/Adagio/Art/adagio.glb",
];

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

async function openViewerTarget() {
  let targets;
  try {
    targets = await readJson(`${cdpBaseUrl}/json/list`);
  } catch (error) {
    throw new Error(`Electron CDP is not reachable at ${cdpBaseUrl}; start it with remote debugging before this test. ${error.message}`);
  }
  const target =
    targets.find((item) => item.type === "page" && /extracted\/viewer\/index\.html/.test(item.url || "")) ||
    targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("No Electron page target with a WebSocket debugger URL was found.");
  return target;
}

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", () => reject(new Error(`Could not connect to ${url}`)), { once: true });
  });
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || "CDP command failed"));
      else resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(session, expression) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed";
    throw new Error(description);
  }
  return result.result?.value;
}

async function selectAndMeasureFixture(fixturePath) {
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(predicate, label, timeoutMs = 45000) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeoutMs) {
      const value = predicate();
      if (value) return value;
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }

  function sampleCanvasNonBlackPixels(canvas) {
    if (!canvas) return 0;
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return 0;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    if (!width || !height) return 0;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const stride = Math.max(1, Math.floor((width * height) / 20000));
    let visiblePixels = 0;
    for (let pixel = 0; pixel < width * height; pixel += stride) {
      const cursor = pixel * 4;
      const alpha = pixels[cursor + 3];
      const lightness = pixels[cursor] + pixels[cursor + 1] + pixels[cursor + 2];
      if (alpha > 0 && lightness > 36) visiblePixels += 1;
    }
    return visiblePixels;
  }

  await waitFor(() => document.querySelectorAll("#modelList .model-button").length > 0, "model list", 30000);
  const searchInput = document.querySelector("#searchInput");
  if (searchInput?.value) {
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const characterSelect = document.querySelector("#characterSelect");
  if (characterSelect?.value) {
    characterSelect.value = "";
    characterSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
  await delay(100);
  const buttons = [...document.querySelectorAll("#modelList .model-button")];
  const button = buttons.find((item) => item.title === fixturePath || item.textContent.includes(fixturePath));
  if (!button) {
    return {
      missingFixture: true,
      available: buttons.slice(0, 20).map((item) => item.title || item.textContent.trim()),
    };
  }
  button.click();
  await waitFor(() => {
    const path = document.querySelector("#modelPath")?.textContent || "";
    const stats = document.querySelector("#modelStats")?.textContent || "";
    const health = document.querySelector("#modelHealthText")?.textContent || "";
    return path.includes(fixturePath) && !/正在加载|未加载模型|等待加载模型/.test(`${stats} ${health}`);
  }, fixturePath);
  await delay(600);
  const canvas = document.querySelector("canvas");
  return {
    path: document.querySelector("#modelPath")?.textContent || "",
    stats: document.querySelector("#modelStats")?.textContent || "",
    health: document.querySelector("#modelHealthText")?.textContent || "",
    canvasPixels: sampleCanvasNonBlackPixels(canvas),
    canvasWidth: canvas?.width || 0,
    canvasHeight: canvas?.height || 0,
  };
}

async function selectFixtureAndMeasure(session, fixture) {
  return evaluate(
    session,
    `(${selectAndMeasureFixture.toString()})(${JSON.stringify(fixture)})`,
  );
}

test("viewer material runtime smoke fixtures render through Electron", { timeout: 180000 }, async () => {
  const target = await openViewerTarget();
  const socket = await connectWebSocket(target.webSocketDebuggerUrl);
  const session = new CdpSession(socket);
  try {
    await session.send("Page.enable");
    await session.send("Page.reload", { ignoreCache: true });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    for (const fixture of materialFixtures) {
      const result = await selectFixtureAndMeasure(session, fixture);
      assert.equal(result.missingFixture, undefined, `${fixture} is missing from model list: ${JSON.stringify(result.available)}`);
      assert.match(result.path, new RegExp(fixture.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(result.stats, /材质管线/);
      assert.doesNotMatch(result.health, /未加载模型/);
      assert.ok(result.canvasPixels > 200, `${fixture} rendered too few visible pixels: ${JSON.stringify(result)}`);
    }
  } finally {
    session.close();
  }
});
