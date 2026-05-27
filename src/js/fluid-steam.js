// WebGL steam overlay — wraps MIT fluid sim for smokestack bursts
import { createFluidSimulation } from "../lib/fluid/fluid-sim.js";

const STEAM_DYE = { r: 0.42, g: 0.4, b: 0.36 };
const STEAM_DYE_LIGHT = { r: 0.55, g: 0.52, b: 0.46 };

/** 0–1: lower = slower rise, gentler spread, less violent eruption (main tuning knob) */
const STEAM_PRESSURE = 0.4;

function isMobile() {
  return /Mobi|Android/i.test(navigator.userAgent);
}

/**
 * @param {{ layer: HTMLElement, getOriginElements: () => HTMLElement[], reducedMotion?: boolean }} opts
 */
export function createFluidSteam(opts) {
  const { layer, getOriginElements, reducedMotion = false } = opts;

  if (reducedMotion) {
    return {
      burst() {},
      burstAtStack() {},
      clear() {},
      resize() {},
      destroy() {},
    };
  }

  let canvas = layer.querySelector(".steam-fluid");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "steam-fluid";
    canvas.className = "steam-fluid";
    canvas.setAttribute("aria-hidden", "true");
    layer.appendChild(canvas);
  }

  const sim = createFluidSimulation(canvas, {
    SIM_RESOLUTION: isMobile() ? 64 : 96,
    DYE_RESOLUTION: isMobile() ? 256 : 512,
    DENSITY_DISSIPATION: 2.4,
    VELOCITY_DISSIPATION: 0.78,
    CURL: 6,
    SPLAT_RADIUS: 0.24,
    SPLAT_FORCE: 1600 * STEAM_PRESSURE + 280,
    TRANSPARENT: true,
    COLORFUL: false,
    SHADING: false,
    BLOOM: false,
    SUNRAYS: false,
  });

  let burstGen = 0;
  /** @type {Array<{ gen: number, mouth: {x:number,y:number}, start: number, duration: number, emitAcc: number, emitIndex: number }>} */
  const activeBursts = [];
  let visible = !document.hidden;
  let paused = false;

  function stopAllBursts() {
    activeBursts.length = 0;
  }

  function getOriginsUV() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return [];

    return getOriginElements()
      .map((el) => {
        const cap = el.closest(".pipe-cap");
        const ref = cap ?? el;
        const o = ref.getBoundingClientRect();
        const x = (o.left + o.width / 2 - rect.left) / rect.width;
        const rimY = o.top - 3;
        const y = 1 - (rimY - rect.top) / rect.height;
        return { x, y };
      })
      .filter(Boolean);
  }

  function splatSteam(uv, phase) {
    const p = STEAM_PRESSURE;
    const forceScale = (sim.config.SPLAT_FORCE / 6000) * p;
    let radiusMul = 1;
    let dye = STEAM_DYE;
    let dx = 0;
    let dy = 0;

    if (phase === "vent") {
      radiusMul = 0.65;
      dye = { r: STEAM_DYE.r * 0.95, g: STEAM_DYE.g * 0.95, b: STEAM_DYE.b * 0.95 };
      dx = 0;
      dy = 400 * forceScale;
    } else if (phase === "main") {
      radiusMul = 1.05;
      dye = STEAM_DYE_LIGHT;
      dx = 0;
      dy = 520 * forceScale;
    } else if (phase === "trail") {
      radiusMul = 0.75;
      dye = { r: STEAM_DYE.r * 0.85, g: STEAM_DYE.g * 0.85, b: STEAM_DYE.b * 0.85 };
      dx = 0;
      dy = 440 * forceScale;
    } else {
      dy = 460 * forceScale;
    }

    const savedRadius = sim.config.SPLAT_RADIUS;
    sim.config.SPLAT_RADIUS = savedRadius * radiusMul;
    sim.splat(uv.x, uv.y, dx, dy, dye);
    sim.config.SPLAT_RADIUS = savedRadius;
  }

  function phaseForElapsed(elapsed, duration) {
    const t = elapsed / duration;
    if (t < 0.15) return "vent";
    if (t < 0.8) return "main";
    return "trail";
  }

  function splatsPerSecond(phase) {
    const p = STEAM_PRESSURE;
    if (phase === "vent") return (isMobile() ? 18 : 26) * p;
    if (phase === "main") return (isMobile() ? 28 : 40) * p;
    return (isMobile() ? 12 : 18) * p;
  }

  /** Deterministic ring above cap rim — avoids random pile-up on one sim cell */
  function columnUV(mouth, emitIndex, elapsed) {
    const widen = Math.min(elapsed / 2500, 1);
    const angle = emitIndex * 2.399963;
    const radius = 0.0025 + widen * 0.009;
    return {
      x: mouth.x + Math.cos(angle) * radius,
      y: mouth.y + 0.016 + Math.min(emitIndex * 0.00035, 0.012),
    };
  }

  function releaseSteamAt(stackIndex) {
    if (!visible || paused) return;
    const origins = getOriginsUV();
    const mouth = origins[stackIndex] ?? origins[0];
    if (!mouth) return;

    activeBursts.push({
      gen: burstGen,
      mouth: { x: mouth.x, y: mouth.y },
      start: performance.now(),
      duration: 16000 + Math.random() * 9000,
      emitAcc: 0,
      emitIndex: 0,
    });
  }

  sim.setFrameCallback((dt, now) => {
    if (!visible || paused) return;

    for (let i = activeBursts.length - 1; i >= 0; i--) {
      const burst = activeBursts[i];
      if (burst.gen !== burstGen) {
        activeBursts.splice(i, 1);
        continue;
      }

      const elapsed = now - burst.start;
      if (elapsed > burst.duration) {
        activeBursts.splice(i, 1);
        continue;
      }

      const phase = phaseForElapsed(elapsed, burst.duration);
      burst.emitAcc += splatsPerSecond(phase) * dt;

      if (burst.emitAcc >= 1) {
        burst.emitAcc -= 1;
        burst.emitIndex += 1;
        splatSteam(columnUV(burst.mouth, burst.emitIndex, elapsed), phase);
      }
    }
  });

  function burstAtStack(stackIndex = 0) {
    releaseSteamAt(stackIndex);
  }

  function burst() {
    const origins = getOriginsUV();
    origins.forEach((_, i) => releaseSteamAt(i));
  }

  function onVisibility() {
    visible = !document.hidden;
    sim.setPaused(!visible || paused);
  }

  document.addEventListener("visibilitychange", onVisibility);

  function resize() {
    sim.resize();
  }

  function clear() {
    stopAllBursts();
    burstGen++;
    sim.clear();
  }

  function destroy() {
    stopAllBursts();
    sim.setFrameCallback(null);
    document.removeEventListener("visibilitychange", onVisibility);
    sim.destroy();
    canvas.remove();
  }

  sim.setPaused(false);

  return {
    burst,
    burstAtStack,
    clear,
    resize,
    destroy,
    getOriginsUV,
  };
}
