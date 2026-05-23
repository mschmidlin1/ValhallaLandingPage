import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "script-source.js"), "utf8");
const lines = src.split(/\r?\n/);

// Drop MIT header through promo (keep license in LICENSE file)
let start = lines.findIndex((l) => l.includes("let config = {"));
if (start < 0) throw new Error("config block not found");

let end = lines.findIndex((l) => l.startsWith("canvas.addEventListener('mousedown'"));
if (end < 0) end = lines.findIndex((l) => l.includes("canvas.addEventListener('mousedown'"));

// Helpers after pointer handlers (still part of sim core)
const helperStart = lines.findIndex((l) => l.startsWith("function generateColor"));
const helperEnd = lines.findIndex((l) => l.startsWith("function scaleByPixelRatio"));

const core = lines.slice(start, end);

// Remove auto-init and rAF loop at bottom
const tailStart = core.findIndex((l) => l.trim() === "updateKeywords();");
const tailEnd = core.findIndex((l) => l.trim() === "update();");
const tail = core.splice(tailStart, tailEnd - tailStart + 2); // includes update() { ... }

// Remove startGUI call block reference - we'll strip startGUI function separately
const body = core
  .filter((l) => !l.includes("startGUI();"))
  .filter((l) => !l.includes("ga("))
  .join("\n");

const out = `/*
 * WebGL Fluid Simulation — trimmed ES module
 * Copyright (c) 2017 Pavel Dobryakov — MIT License
 * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 */

const DEFAULT_CONFIG = {
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: 512,
  DENSITY_DISSIPATION: 0.97,
  VELOCITY_DISSIPATION: 0.2,
  PRESSURE: 0.8,
  PRESSURE_ITERATIONS: 20,
  CURL: 12,
  SPLAT_RADIUS: 0.2,
  SPLAT_FORCE: 4000,
  SHADING: false,
  COLORFUL: false,
  COLOR_UPDATE_SPEED: 10,
  PAUSED: false,
  BACK_COLOR: { r: 0, g: 0, b: 0 },
  TRANSPARENT: true,
  BLOOM: false,
  BLOOM_ITERATIONS: 8,
  BLOOM_RESOLUTION: 256,
  BLOOM_INTENSITY: 0.8,
  BLOOM_THRESHOLD: 0.6,
  BLOOM_SOFT_KNEE: 0.7,
  SUNRAYS: false,
  SUNRAYS_RESOLUTION: 196,
  SUNRAYS_WEIGHT: 1.0,
};

function isMobile() {
  return /Mobi|Android/i.test(navigator.userAgent);
}

export function createFluidSimulation(canvas, userConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...userConfig };

${body
  .replace(/^let config = \\{[\\s\\S]*?\\};/m, "")
  .replace(/^const canvas = document\\.getElementsByTagName\\('canvas'\\)\\[0\\];\\s*resizeCanvas\\(\\);/m, "")
  .replace(/^function startGUI[\\s\\S]*?^\\}/m, "")
  .replace(/^function captureScreenshot[\\s\\S]*?^\\}/m, "")
  .replace(/^function isMobile[\\s\\S]*?^\\}/m, "")}

  let rafId = 0;
  let destroyed = false;
  let lastUpdateTime = Date.now();
  let colorUpdateTimer = 0.0;
  const splatQueue = [];

  resizeCanvas();
  updateKeywords();
  initFramebuffers();

  function tick() {
    if (destroyed) return;
    const dt = calcDeltaTime();
    if (resizeCanvas()) initFramebuffers();
    updateColors(dt);
    while (splatQueue.length > 0) {
      const item = splatQueue.shift();
      splat(item.x, item.y, item.dx, item.dy, item.color);
    }
    if (!config.PAUSED) step(dt);
    render(null);
    rafId = requestAnimationFrame(tick);
  }

  function calcDeltaTime() {
    const now = Date.now();
    let dt = (now - lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    lastUpdateTime = now;
    return dt;
  }

  tick();

  return {
    splat(x, y, dx, dy, color) {
      splatQueue.push({ x, y, dx, dy, color });
    },
    clear() {
      initFramebuffers();
    },
    resize() {
      if (resizeCanvas()) initFramebuffers();
    },
    setPaused(paused) {
      config.PAUSED = paused;
    },
    destroy() {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
    },
    get config() {
      return config;
    },
  };
}
`;

// Simpler approach: manual splice - the regex replace in template may fail
// Re-read and do line-based processing

const header = `/*
 * WebGL Fluid Simulation — trimmed ES module
 * Copyright (c) 2017 Pavel Dobryakov — MIT License
 * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 */

const DEFAULT_CONFIG = {
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: 512,
  DENSITY_DISSIPATION: 0.97,
  VELOCITY_DISSIPATION: 0.2,
  PRESSURE: 0.8,
  PRESSURE_ITERATIONS: 20,
  CURL: 12,
  SPLAT_RADIUS: 0.2,
  SPLAT_FORCE: 4000,
  SHADING: false,
  COLORFUL: false,
  COLOR_UPDATE_SPEED: 10,
  PAUSED: false,
  BACK_COLOR: { r: 0, g: 0, b: 0 },
  TRANSPARENT: true,
  BLOOM: false,
  BLOOM_ITERATIONS: 8,
  BLOOM_RESOLUTION: 256,
  BLOOM_INTENSITY: 0.8,
  BLOOM_THRESHOLD: 0.6,
  BLOOM_SOFT_KNEE: 0.7,
  SUNRAYS: false,
  SUNRAYS_RESOLUTION: 196,
  SUNRAYS_WEIGHT: 1.0,
};

function isMobileAgent() {
  return /Mobi|Android/i.test(navigator.userAgent);
}

export function createFluidSimulation(canvas, userConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...userConfig };
`;

let i = start;
// skip old config and canvas init
while (i < lines.length && !lines[i].includes("function pointerPrototype")) i++;
const coreLines = [];
for (; i < end; i++) {
  const line = lines[i];
  if (line.includes("function startGUI")) {
    while (i < lines.length && !lines[i].startsWith("}")) i++;
    i++;
    continue;
  }
  if (line.includes("function captureScreenshot")) {
    while (i < lines.length && !lines[i].startsWith("}")) i++;
    i++;
    continue;
  }
  if (line.includes("function isMobile ()")) {
    while (i < lines.length && !lines[i].startsWith("}")) i++;
    i++;
    continue;
  }
  if (line.includes("ga(")) continue;
  if (line.includes("startGUI();")) continue;
  if (line.trim() === "resizeCanvas();" && coreLines.length < 5) continue;
  coreLines.push(line.replace(/isMobile\(\)/g, "isMobileAgent()"));
}

const footer = `
  let rafId = 0;
  let destroyed = false;
  let lastUpdateTime = Date.now();
  let colorUpdateTimer = 0.0;
  const splatQueue = [];

  resizeCanvas();
  updateKeywords();
  initFramebuffers();

  function tick() {
    if (destroyed) return;
    const dt = calcDeltaTime();
    if (resizeCanvas()) initFramebuffers();
    updateColors(dt);
    while (splatQueue.length > 0) {
      const item = splatQueue.shift();
      splat(item.x, item.y, item.dx, item.dy, item.color);
    }
    if (!config.PAUSED) step(dt);
    render(null);
    rafId = requestAnimationFrame(tick);
  }

  function calcDeltaTime() {
    const now = Date.now();
    let dt = (now - lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    lastUpdateTime = now;
    return dt;
  }

  tick();

  return {
    splat(x, y, dx, dy, color) {
      splatQueue.push({ x, y, dx, dy, color });
    },
    clear() {
      initFramebuffers();
    },
    resize() {
      if (resizeCanvas()) initFramebuffers();
    },
    setPaused(paused) {
      config.PAUSED = paused;
    },
    destroy() {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
    },
    get config() {
      return config;
    },
  };
}
`;

// Remove duplicate calcDeltaTime and update from core if present
const filtered = coreLines.filter((line, idx, arr) => {
  if (line.trim() === "updateKeywords();" && arr[idx + 1]?.includes("initFramebuffers")) {
    // skip auto-init block
    return false;
  }
  if (line.trim() === "initFramebuffers();" && arr[idx - 1]?.trim() === "updateKeywords();") return false;
  if (line.includes("multipleSplats(parseInt")) return false;
  if (line.trim() === "let lastUpdateTime = Date.now();") return false;
  if (line.trim() === "let colorUpdateTimer = 0.0;") return false;
  if (line.trim() === "update();") return false;
  if (line.startsWith("function update ()")) return false;
  if (line.startsWith("function calcDeltaTime ()")) return false;
  if (line.trim() === "requestAnimationFrame(update);") return false;
  return true;
});

// Remove inner update/calcDeltaTime function bodies (brace-balanced)
let outLines = [];
for (let j = 0; j < filtered.length; j++) {
  if (
    filtered[j].startsWith("function update ()") ||
    filtered[j].startsWith("function calcDeltaTime ()")
  ) {
    let depth = 0;
    let k = j;
    for (; k < filtered.length; k++) {
      depth += (filtered[k].match(/{/g) || []).length;
      depth -= (filtered[k].match(/}/g) || []).length;
      if (depth <= 0 && k > j) {
        j = k;
        break;
      }
    }
    continue;
  }
  outLines.push(filtered[j]);
}

const helpers =
  helperStart >= 0 && helperEnd > helperStart
    ? lines
        .slice(helperStart, helperEnd)
        .map((l) => l.replace(/isMobile\(\)/g, "isMobileAgent()"))
        .map((l) =>
          l.includes("window.devicePixelRatio")
            ? "    const pixelRatio = Math.min(window.devicePixelRatio || 1, isMobileAgent() ? 1.25 : 1.5);"
            : l.includes("return Math.floor(input * pixelRatio)")
              ? "    return Math.floor(input * pixelRatio);"
              : l
        )
        .filter((l, i, arr) => {
          if (l.includes("let pixelRatio = window.devicePixelRatio")) return false;
          if (i > 0 && arr[i - 1]?.includes("const pixelRatio = Math.min")) {
            if (l.trim() === "return Math.floor(input * pixelRatio);") return true;
          }
          return !l.includes("function scaleByPixelRatio");
        })
        .join("\n")
    : "";

const final = header + outLines.join("\n") + (helpers ? `\n${helpers}\n` : "") + footer;
fs.writeFileSync(path.join(dir, "fluid-sim.js"), final);
fs.writeFileSync(
  path.join(dir, "LICENSE"),
  "MIT License — Copyright (c) 2017 Pavel Dobryakov\nhttps://github.com/PavelDoGreat/WebGL-Fluid-Simulation\n"
);
console.log("Wrote fluid-sim.js", final.length, "bytes");
