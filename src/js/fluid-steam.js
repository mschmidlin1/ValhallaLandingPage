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
      burstAtVent() {},
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

  // Live UV position of a single origin element. Recomputed on demand (and
  // every frame for active bursts) so the steam source tracks the vent as the
  // page scrolls. data-steam-dir is the screen-space sign (+1 right, -1 left);
  // dir 0 falls back to the legacy upward column.
  function measureOriginUV(el) {
    if (!el) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const cap = el.closest(".pipe-cap");
    const ref = cap ?? el;
    const o = ref.getBoundingClientRect();
    const x = (o.left + o.width / 2 - rect.left) / rect.width;
    const dir = parseFloat(el.dataset?.steamDir ?? "0") || 0;
    let y;
    if (dir === 0) {
      const rimY = o.top - 3;
      y = 1 - (rimY - rect.top) / rect.height;
    } else {
      y = 1 - (o.top + o.height / 2 - rect.top) / rect.height;
    }
    return { x, y, dir };
  }

  function onScreenUV(uv) {
    return uv.x >= -0.1 && uv.x <= 1.1 && uv.y >= -0.1 && uv.y <= 1.1;
  }

  function getOriginsUV() {
    return getOriginElements().map(measureOriginUV).filter(Boolean);
  }

  function splatSteam(uv, phase, dir = 0) {
    const p = STEAM_PRESSURE;
    const forceScale = (sim.config.SPLAT_FORCE / 6000) * p;
    let radiusMul = 1;
    let dye = STEAM_DYE;
    let mag = 460 * forceScale;

    if (phase === "vent") {
      radiusMul = 0.65;
      dye = { r: STEAM_DYE.r * 0.95, g: STEAM_DYE.g * 0.95, b: STEAM_DYE.b * 0.95 };
      mag = 420 * forceScale;
    } else if (phase === "main") {
      radiusMul = 1.05;
      dye = STEAM_DYE_LIGHT;
      mag = 540 * forceScale;
    } else if (phase === "trail") {
      radiusMul = 0.75;
      dye = { r: STEAM_DYE.r * 0.85, g: STEAM_DYE.g * 0.85, b: STEAM_DYE.b * 0.85 };
      mag = 440 * forceScale;
    }

    let dx;
    let dy;
    if (dir === 0) {
      // Legacy upward column.
      dx = 0;
      dy = mag;
    } else {
      // Side vent: push mostly sideways with a little upward buoyancy so the
      // jet drifts up as it disperses.
      dx = dir * mag;
      dy = mag * 0.28;
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

  /** Deterministic emission cloud near the mouth — avoids pile-up on one cell.
   *  For side vents (dir != 0) the cloud is nudged out along the vent axis. */
  function columnUV(mouth, emitIndex, elapsed, dir = 0) {
    const widen = Math.min(elapsed / 2500, 1);
    const angle = emitIndex * 2.399963;
    const radius = 0.0025 + widen * 0.009;
    if (dir === 0) {
      return {
        x: mouth.x + Math.cos(angle) * radius,
        y: mouth.y + 0.016 + Math.min(emitIndex * 0.00035, 0.012),
      };
    }
    return {
      x: mouth.x + dir * (0.014 + Math.min(emitIndex * 0.0003, 0.01)) + Math.cos(angle) * radius,
      y: mouth.y + Math.sin(angle) * radius,
    };
  }

  function releaseSteamAt(stackIndex, opts = {}) {
    if (!visible || paused) return;
    const els = getOriginElements();
    const el = els[stackIndex] ?? els[0];
    const mouth = measureOriginUV(el);
    if (!mouth) return;
    // The origin element is re-measured every frame (see frame callback) so the
    // jet follows the vent during scroll; we keep a reference here rather than
    // a frozen UV. Off-screen frames simply skip emission.
    activeBursts.push({
      gen: burstGen,
      el,
      mouth: { x: mouth.x, y: mouth.y, dir: mouth.dir ?? 0 },
      start: performance.now(),
      duration: opts.durationMs ?? (16000 + Math.random() * 9000),
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

      // Re-measure the vent each frame so the steam source tracks it on scroll.
      const live = measureOriginUV(burst.el) || burst.mouth;
      burst.mouth = live;

      const phase = phaseForElapsed(elapsed, burst.duration);
      burst.emitAcc += splatsPerSecond(phase) * dt;

      if (burst.emitAcc >= 1) {
        burst.emitAcc -= 1;
        burst.emitIndex += 1;
        if (onScreenUV(live)) {
          const dir = live.dir ?? 0;
          splatSteam(columnUV(live, burst.emitIndex, elapsed, dir), phase, dir);
        }
      }
    }
  });

  function burstAtStack(stackIndex = 0) {
    releaseSteamAt(stackIndex);
  }

  /** Steam burst from a side vent for a bounded duration (default 6s). */
  function burstAtVent(ventIndex = 0, opts = {}) {
    releaseSteamAt(ventIndex, { durationMs: opts.durationMs ?? 6000 });
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
    burstAtVent,
    clear,
    resize,
    destroy,
    getOriginsUV,
  };
}
