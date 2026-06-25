// Engine Room landing page
// - Procedurally generates viewport-pinned side cog columns
// - Ties rotation to scroll via GSAP ScrollTrigger
// - Brass pressure-gauge tool cards from links.js
// - Procedural smokestacks with WebGL fluid steam bursts

import { VALHALLA_LINKS, hasNavigableUrl } from "./links.js";
import { fetchTrendlineUrl } from "./trendline-link.js";
import { createFluidSteam } from "./fluid-steam.js?v=21";
import { attachGaugePipeNetwork, buildGaugePipeNetwork } from "./pipe-network.js?v=31";

gsap.registerPlugin(ScrollTrigger);

const NS = "http://www.w3.org/2000/svg";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Seeded RNG ------------------------------------------------ */
function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/* ---------- Gear path + build ----------------------------------------- */
function gearPath(cx, cy, teeth, outerR, rootR, phase = 0) {
  const segs = teeth * 4;
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const angle = (i / segs) * Math.PI * 2 + phase;
    const quad = i % 4;
    const r = quad === 0 || quad === 1 ? outerR : rootR;
    pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]} ${pts[i][1]}`;
  return d + " Z";
}

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function gearClipPathId(gearId) {
  return `gclip-${gearId.replace(/[^a-z0-9-]/gi, "")}`;
}

function gearMaskId(gearId) {
  return `gmask-${gearId.replace(/[^a-z0-9-]/gi, "")}`;
}

function createCutoutRegistry() {
  const holes = [];
  return {
    add(d, evenodd = false) {
      holes.push({ d, evenodd });
    },
    addCircle(cx, cy, r) {
      this.add(circlePathD(cx, cy, r));
    },
    addAnnulus(cx, cy, outerR, innerR) {
      this.add(`${circlePathD(cx, cy, outerR)} ${circlePathD(cx, cy, innerR)}`, true);
    },
    addSector(cx, cy, r0, r1, a0, a1) {
      this.add(sectorPathD(cx, cy, r0, r1, a0, a1));
    },
    get all() {
      return holes;
    },
  };
}

function ensureGearMask(svgRoot, gearId, gearShape, cutouts) {
  const defs = svgRoot.querySelector("defs") || (() => {
    const d = document.createElementNS(NS, "defs");
    svgRoot.insertBefore(d, svgRoot.firstChild);
    return d;
  })();
  const id = gearMaskId(gearId);
  const existing = defs.querySelector(`#${id}`);
  if (existing) existing.remove();

  const mask = el("mask", { id });
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  mask.setAttribute("x", "-50%");
  mask.setAttribute("y", "-50%");
  mask.setAttribute("width", "200%");
  mask.setAttribute("height", "200%");
  mask.appendChild(el("path", { d: gearShape, fill: "white" }));
  for (const { d, evenodd } of cutouts) {
    mask.appendChild(el("path", {
      d,
      fill: "black",
      "fill-rule": evenodd ? "evenodd" : "nonzero",
    }));
  }
  defs.appendChild(mask);
}

function appendHoleRims(g, cx, cy, innerR, outerR, finish) {
  const p = depthPalette(finish);
  if (innerR > 0) {
    g.appendChild(el("circle", {
      cx, cy, r: innerR,
      fill: "none",
      stroke: p.highlight,
      "stroke-width": Math.max(0.45, innerR * 0.05),
      opacity: 0.32,
    }));
  }
  if (outerR > 0) {
    g.appendChild(el("circle", {
      cx, cy, r: outerR,
      fill: "none",
      stroke: p.shadow,
      "stroke-width": Math.max(0.45, outerR * 0.04),
      opacity: 0.36,
    }));
  }
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

function mixHex(c1, c2, t) {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const m = (i) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `#${[m(0), m(1), m(2)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function depthPalette(finish) {
  const w = finish.weathering || {};
  const base = finish.base || "#b08d57";
  const shadow = w.grime || "#1a120a";
  const highlight = w.highlight || mixHex(base, "#ffffff", 0.45);
  return {
    base,
    highlight,
    shadow,
    pit: mixHex(base, shadow, 0.72),
    void: mixHex(shadow, "#000000", 0.35),
    raised: mixHex(base, highlight, 0.38),
    recess: mixHex(base, shadow, 0.55),
  };
}

function circlePathD(cx, cy, r) {
  return `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} Z`;
}

function sectorPathD(cx, cy, r0, r1, a0, a1) {
  const x0o = cx + Math.cos(a0) * r1;
  const y0o = cy + Math.sin(a0) * r1;
  const x1o = cx + Math.cos(a1) * r1;
  const y1o = cy + Math.sin(a1) * r1;
  const x1i = cx + Math.cos(a1) * r0;
  const y1i = cy + Math.sin(a1) * r0;
  const x0i = cx + Math.cos(a0) * r0;
  const y0i = cy + Math.sin(a0) * r0;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0o} ${y0o} A ${r1} ${r1} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${r0} ${r0} 0 ${large} 0 ${x0i} ${y0i} Z`;
}

function wantsThrough(geom, opts) {
  return !!(opts.through && geom?.throughCutouts && geom?.cutouts);
}

/** Transparent windows only in the angular gaps between spokes (hub stays tied to rim via spokes). */
function appendSpokeGapVoids(g, geom, finish, spokes, phase, opts = {}) {
  const { cx, cy, hubR, innerR } = geom;
  const gap = (Math.PI * 2) / spokes;
  const inset = opts.edgeInset ?? 0.14;
  const rInner = hubR * (opts.hubMargin ?? 1.32);
  const rOuter = innerR * (opts.faceMax ?? 0.96);
  for (let i = 0; i < spokes; i++) {
    const a0 = phase + i * gap + gap * inset;
    const a1 = phase + (i + 1) * gap - gap * inset;
    appendSectorVoid(g, geom, cx, cy, rInner, rOuter, a0, a1, finish, {
      through: opts.through,
    });
  }
}

function appendHollowAnnulus(g, geom, cx, cy, outerR, innerR, finish, opts = {}) {
  if (innerR >= outerR - 0.5) return;
  if (wantsThrough(geom, opts)) {
    geom.cutouts.addAnnulus(cx, cy, outerR, innerR);
    appendHoleRims(g, cx, cy, innerR, outerR, finish);
    return;
  }
  const p = depthPalette(finish);
  g.appendChild(el("path", {
    d: `${circlePathD(cx, cy, outerR)} ${circlePathD(cx, cy, innerR)}`,
    fill: `url(#${finish.recessGradId})`,
    "fill-rule": "evenodd",
    opacity: opts.opacity ?? 0.95,
  }));
  appendHoleRims(g, cx, cy, innerR, outerR, finish);
}

function appendSectorVoid(g, geom, cx, cy, r0, r1, a0, a1, finish, opts = {}) {
  if (r1 <= r0 + 0.5 || a1 <= a0) return;
  if (wantsThrough(geom, opts)) {
    geom.cutouts.addSector(cx, cy, r0, r1, a0, a1);
    const midA = (a0 + a1) / 2;
    const p = depthPalette(finish);
    g.appendChild(el("line", {
      x1: cx + Math.cos(midA) * r1 * 0.98,
      y1: cy + Math.sin(midA) * r1 * 0.98,
      x2: cx + Math.cos(midA) * r0,
      y2: cy + Math.sin(midA) * r0,
      stroke: p.shadow,
      "stroke-width": Math.max(0.6, r1 * 0.025),
      opacity: 0.35,
      "stroke-linecap": "round",
    }));
    return;
  }
  const p = depthPalette(finish);
  g.appendChild(el("path", {
    d: sectorPathD(cx, cy, r0, r1, a0, a1),
    fill: `url(#${finish.recessGradId})`,
    opacity: opts.opacity ?? 0.92,
  }));
  const midA = (a0 + a1) / 2;
  g.appendChild(el("line", {
    x1: cx + Math.cos(midA) * r1 * 0.98,
    y1: cy + Math.sin(midA) * r1 * 0.98,
    x2: cx + Math.cos(midA) * r0,
    y2: cy + Math.sin(midA) * r0,
    stroke: p.shadow,
    "stroke-width": Math.max(0.6, r1 * 0.025),
    opacity: 0.35,
    "stroke-linecap": "round",
  }));
}

function appendRaisedBoss(g, geom, cx, cy, radius, finish, opts = {}) {
  const p = depthPalette(finish);
  const r = radius;
  const boreInner = r * (opts.boreInner ?? 0.18);

  if (opts.bore && wantsThrough(geom, { through: true })) {
    const boreOuter = r * (opts.boreOuter ?? 0.42);
    geom.cutouts.addAnnulus(cx, cy, boreOuter, boreInner);
    g.appendChild(el("path", {
      d: `${circlePathD(cx, cy, r)} ${circlePathD(cx, cy, boreInner)}`,
      fill: `url(#${finish.raisedGradId})`,
      "fill-rule": "evenodd",
      stroke: p.shadow,
      "stroke-width": Math.max(0.6, r * 0.06),
      opacity: opts.opacity ?? 0.94,
    }));
  } else {
    g.appendChild(el("circle", {
      cx, cy, r,
      fill: `url(#${finish.raisedGradId})`,
      stroke: p.shadow,
      "stroke-width": Math.max(0.6, r * 0.06),
      opacity: opts.opacity ?? 0.94,
    }));
  }

  g.appendChild(el("ellipse", {
    cx: cx - r * 0.22,
    cy: cy - r * 0.26,
    rx: r * 0.55,
    ry: r * 0.35,
    fill: p.highlight,
    opacity: 0.07 + (opts.gloss ?? 0.06),
  }));
}

function appendChamferedSpoke(g, cx, cy, angle, hubR, innerR, finish, spokeW) {
  const half = spokeW * 0.48;
  const perp = angle + Math.PI / 2;
  const r0 = hubR + 2;
  const r1 = innerR - 2;
  const p = depthPalette(finish);
  const pt = (r, side) => {
    const bx = cx + Math.cos(angle) * r;
    const by = cy + Math.sin(angle) * r;
    return [bx + Math.cos(perp) * half * side, by + Math.sin(perp) * half * side];
  };
  const [x1, y1] = pt(r0, 1);
  const [x2, y2] = pt(r1, 1);
  const [x3, y3] = pt(r1, -1);
  const [x4, y4] = pt(r0, -1);
  g.appendChild(el("path", {
    d: `M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} L ${x4} ${y4} Z`,
    fill: `url(#${finish.raisedGradId})`,
    stroke: p.shadow,
    "stroke-width": Math.max(0.4, spokeW * 0.08),
    opacity: 0.92,
  }));
  g.appendChild(el("line", {
    x1: x2, y1: y2, x2: x3, y2: y3,
    stroke: p.highlight,
    "stroke-width": Math.max(0.35, spokeW * 0.06),
    opacity: 0.22,
    "stroke-linecap": "round",
  }));
}

function hubFiligreeRing(cx, cy, r, count, phase) {
  let d = "";
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + phase;
    const mx = cx + Math.cos(a) * r;
    const my = cy + Math.sin(a) * r;
    const s = r * 0.22;
    const c1x = mx + Math.cos(a + Math.PI / 2) * s;
    const c1y = my + Math.sin(a + Math.PI / 2) * s;
    const c2x = mx + Math.cos(a - Math.PI / 2) * s;
    const c2y = my + Math.sin(a - Math.PI / 2) * s;
    const ex = cx + Math.cos(a + Math.PI / count) * r;
    const ey = cy + Math.sin(a + Math.PI / count) * r;
    d += `M ${mx} ${my} Q ${c1x} ${c1y} ${ex} ${ey} Q ${c2x} ${c2y} ${mx} ${my} `;
  }
  return d.trim();
}

function makeGearGeom(cx, cy, outerR, rootR, hubR, phase, teeth) {
  return { cx, cy, outerR, rootR, hubR, innerR: rootR * 0.78, phase, teeth };
}

function appendGearSilhouette(g, cx, cy, teeth, outerR, rootR, phase, attrs) {
  g.appendChild(el("path", { d: gearPath(cx, cy, teeth, outerR, rootR, phase), ...attrs }));
}

function appendNestedGear(g, geom, cx, cy, teeth, outerR, phase, finish, opts = {}) {
  const rootR = outerR * (opts.rootRatio ?? 0.72);
  const hubHole = outerR * (opts.holeRatio ?? 0.22);
  const opacity = opts.opacity ?? 0.9;
  const p = depthPalette(finish);
  const gearD = gearPath(cx, cy, teeth, outerR, rootR, phase);

  if (opts.hollow) {
    if (wantsThrough(geom, { through: true })) geom.cutouts.addCircle(cx, cy, hubHole);
    g.appendChild(el("path", {
      d: `${gearD} ${circlePathD(cx, cy, hubHole)}`,
      fill: `url(#${finish.raisedGradId})`,
      "fill-rule": "evenodd",
      stroke: p.shadow,
      "stroke-width": opts.strokeWidth ?? Math.max(0.7, outerR * 0.05),
      opacity,
    }));
    appendHoleRims(g, cx, cy, hubHole, hubHole * 1.05, finish);
  } else {
    appendGearSilhouette(g, cx, cy, teeth, outerR, rootR, phase, {
      fill: opts.fill || `url(#${finish.raisedGradId})`,
      stroke: p.shadow,
      "stroke-width": opts.strokeWidth ?? Math.max(0.8, outerR * 0.06),
      opacity,
    });
    g.appendChild(el("circle", {
      cx, cy, r: hubHole,
      fill: "none",
      stroke: p.highlight,
      "stroke-width": Math.max(0.5, outerR * 0.05),
      opacity: opacity * 0.5,
    }));
  }

  if (opts.ringCount) {
    appendConcentricRings(g, cx, cy, opts.ringCount.map((t) => hubHole * (1.15 + t * 0.32)), p.shadow, 0.45, opacity * 0.55);
  }
}

function appendConcentricRings(g, cx, cy, radii, stroke, strokeWidth = 0.6, opacity = 0.45) {
  for (const r of radii) {
    if (r <= 0) continue;
    g.appendChild(el("circle", {
      cx, cy, r,
      fill: "none", stroke,
      "stroke-width": strokeWidth,
      opacity,
    }));
  }
}

function appendSpoke(g, cx, cy, angle, hubR, innerR, spokeFill, stroke, spokeW, decorRng, curved = false) {
  const shade = decorRng ? 0.88 + decorRng() * 0.12 : 1;
  const x1 = cx + Math.cos(angle) * (hubR + 4);
  const y1 = cy + Math.sin(angle) * (hubR + 4);
  const x2 = cx + Math.cos(angle) * (innerR - 4);
  const y2 = cy + Math.sin(angle) * (innerR - 4);

  if (curved) {
    const midR = (hubR + innerR) * 0.52;
    const bend = curved === true ? 0.14 : Number(curved) || 0.14;
    const mx = cx + Math.cos(angle + bend) * midR;
    const my = cy + Math.sin(angle + bend) * midR;
    g.appendChild(el("path", {
      d: `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`,
      fill: "none",
      stroke: spokeFill,
      "stroke-width": spokeW * shade,
      "stroke-linecap": "round",
      opacity: 0.95,
    }));
  } else {
    g.appendChild(el("line", {
      x1, y1, x2, y2,
      stroke: spokeFill,
      "stroke-width": spokeW * shade,
      "stroke-linecap": "round",
      opacity: 0.95,
    }));
  }

}

function gapCenterAngle(i, spokes, phase) {
  return ((i + 0.5) / spokes) * Math.PI * 2 + phase;
}

function midFaceRadius(geom) {
  return geom.hubR * 1.15 + (geom.innerR - geom.hubR) * 0.55;
}

function appendPocketGears(g, geom, finish, rng, count, opts = {}) {
  const { cx, cy, hubR, phase } = geom;
  const orbit = opts.orbit ?? midFaceRadius(geom);
  const spokes = opts.spokes ?? count;
  for (let i = 0; i < count; i++) {
    const a = gapCenterAngle(i, spokes, phase) + (rng() - 0.5) * 0.08;
    const teeth = (opts.teethBase ?? 7) + (i % 4);
    const size = hubR * (opts.sizeBase ?? 0.5) * (0.85 + (i % 3) * 0.12);
    appendNestedGear(g, geom, cx + Math.cos(a) * orbit, cy + Math.sin(a) * orbit, teeth, size, a + Math.PI / teeth, finish, {
      hollow: true,
      opacity: opts.opacity ?? 0.84,
    });
  }
}

function appendSpokeBraces(g, geom, finish, spokes) {
  const { cx, cy, hubR, innerR, phase } = geom;
  const braceR = hubR + (innerR - hubR) * 0.38;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + phase;
    const a2 = ((i + 0.5) / spokes) * Math.PI * 2 + phase;
    const x1 = cx + Math.cos(a) * (hubR * 1.1);
    const y1 = cy + Math.sin(a) * (hubR * 1.1);
    const x2 = cx + Math.cos(a2) * braceR;
    const y2 = cy + Math.sin(a2) * braceR;
    g.appendChild(el("line", {
      x1, y1, x2, y2,
      stroke: finish.stroke,
      "stroke-width": Math.max(0.8, hubR * 0.06),
      opacity: 0.4,
      "stroke-linecap": "round",
    }));
  }
}

function appendInnerToothRing(g, geom, finish, scale = 0.9, filled = false) {
  const { cx, cy, innerR, phase, teeth } = geom;
  const ringR = innerR * scale;
  const innerTeeth = Math.max(14, Math.floor(teeth * 0.6));
  appendGearSilhouette(g, cx, cy, innerTeeth, ringR, ringR * 0.76, phase + 0.05, {
    fill: filled ? (finish.innerFill || `url(#${finish.hubGradId})`) : "none",
    stroke: finish.stroke,
    "stroke-width": filled ? 1 : Math.max(0.7, ringR * 0.04),
    opacity: filled ? 0.75 : 0.5,
  });
}

function defaultDrawHub(g, geom, finish) {
  const { cx, cy, hubR } = geom;
  if (geom.throughCutouts) {
    appendRaisedBoss(g, geom, cx, cy, hubR, finish, { gloss: 0.08, bore: true, boreOuter: 0.38, boreInner: 0.12 });
  } else {
    appendRaisedBoss(g, geom, cx, cy, hubR, finish, { gloss: 0.08 });
    appendHollowAnnulus(g, geom, cx, cy, hubR * 0.88, hubR * 0.42, finish, { through: false });
  }
}

const COG_DESIGNS = [
  {
    id: "quadrant-nested",
    spokes: 4,
    throughCutouts: true,
    draw(g, geom, finish, rng) {
      const { cx, cy, hubR, innerR, phase } = geom;
      const mid = midFaceRadius(geom);
      appendSpokeGapVoids(g, geom, finish, 4, phase, { through: true });
      appendHollowAnnulus(g, geom, cx, cy, innerR * 0.92, hubR * 1.35, finish, { through: false });
      appendInnerToothRing(g, geom, finish, 0.94);
      const angles = [phase + Math.PI * 0.25, phase + Math.PI * 0.75, phase + Math.PI * 1.25, phase + Math.PI * 1.75];
      const sizes = [hubR * 0.55, hubR * 0.42, hubR * 0.48, hubR * 0.38];
      angles.forEach((a, i) => {
        const px = cx + Math.cos(a) * mid;
        const py = cy + Math.sin(a) * mid;
        appendRaisedBoss(g, geom, px, py, sizes[i] * 1.08, finish, { gloss: 0.05 });
        appendNestedGear(g, geom, px, py, 8 + (i % 2) * 2, sizes[i], a + rng() * 0.08, finish, {
          hollow: true, opacity: 0.9,
        });
      });
    },
  },
  {
    id: "satellite-four",
    spokes: 4,
    draw(g, geom, finish, rng) {
      const { cx, cy, hubR, phase } = geom;
      const orbit = hubR * 1.5 + (geom.innerR - hubR) * 0.45;
      appendHollowAnnulus(g, geom, cx, cy, orbit * 1.06, orbit * 0.78, finish, { through: false });
      appendHollowAnnulus(g, geom, cx, cy, geom.innerR * 0.9, hubR * 1.2, finish, { through: false });
      appendInnerToothRing(g, geom, finish, 0.82);
      for (let i = 0; i < 4; i++) {
        const a = gapCenterAngle(i, 4, phase);
        const px = cx + Math.cos(a) * orbit;
        const py = cy + Math.sin(a) * orbit;
        appendRaisedBoss(g, geom, px, py, hubR * 0.58, finish);
        appendNestedGear(g, geom, px, py, 8, hubR * 0.48, a + Math.PI / 3, finish, { hollow: true, opacity: 0.88 });
      }
      for (let i = 0; i < 4; i++) {
        const a = gapCenterAngle(i, 4, phase);
        appendNestedGear(g, geom, cx + Math.cos(a) * hubR * 1.12, cy + Math.sin(a) * hubR * 1.12, 6, hubR * 0.32, a, finish, {
          hollow: true, opacity: 0.78,
        });
      }
    },
  },
  {
    id: "inner-annulus",
    spokes: 6,
    draw(g, geom, finish, rng) {
      const { cx, cy, hubR, innerR } = geom;
      appendHollowAnnulus(g, geom, cx, cy, innerR * 0.95, hubR * 1.25, finish, { through: false });
      appendHollowAnnulus(g, geom, cx, cy, innerR * 0.72, innerR * 0.48, finish, { through: false });
      appendInnerToothRing(g, geom, finish, 0.92);
      appendGearSilhouette(g, cx, cy, Math.max(14, Math.floor(geom.teeth * 0.55)), innerR * 0.88, innerR * 0.68, geom.phase, {
        fill: `url(#${finish.raisedGradId})`,
        stroke: depthPalette(finish).shadow,
        "stroke-width": 1.2,
        opacity: 0.9,
      });
      appendPocketGears(g, geom, finish, rng, 6, {
        orbit: midFaceRadius(geom), teethBase: 6, sizeBase: 0.38, spokes: 6,
      });
      for (let i = 0; i < 6; i++) {
        const a = gapCenterAngle(i, 6, geom.phase);
        appendNestedGear(g, geom, cx + Math.cos(a) * (hubR * 1.08), cy + Math.sin(a) * (hubR * 1.08), 5, hubR * 0.28, a, finish, {
          hollow: true, opacity: 0.75,
        });
      }
    },
  },
  {
    id: "bridged-spokes",
    spokes: 6,
    throughCutouts: true,
    draw(g, geom, finish, rng) {
      const { cx, cy, hubR, innerR, phase } = geom;
      const bridgeR = hubR + (innerR - hubR) * 0.52;
      appendSpokeGapVoids(g, geom, finish, 6, phase, { through: true, hubMargin: 1.28 });
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2 + phase + 0.08;
        const a1 = ((i + 1) / 6) * Math.PI * 2 + phase - 0.08;
        appendSectorVoid(g, geom, cx, cy, bridgeR * 0.92, innerR * 0.94, a0, a1, finish, { through: false });
      }
      appendInnerToothRing(g, geom, finish, 0.86);
      const p = depthPalette(finish);
      for (let tier = 0; tier < 2; tier++) {
        const r = tier === 0 ? bridgeR : bridgeR + hubR * 0.18;
        for (let i = 0; i < 6; i++) {
          const a1 = (i / 6) * Math.PI * 2 + phase;
          const a2 = ((i + 1) / 6) * Math.PI * 2 + phase;
          const x1 = cx + Math.cos(a1) * r;
          const y1 = cy + Math.sin(a1) * r;
          const x2 = cx + Math.cos(a2) * r;
          const y2 = cy + Math.sin(a2) * r;
          const mx = cx + Math.cos((a1 + a2) / 2) * (r + hubR * 0.1);
          const my = cy + Math.sin((a1 + a2) / 2) * (r + hubR * 0.1);
          g.appendChild(el("path", {
            d: `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`,
            fill: "none",
            stroke: tier === 0 ? p.highlight : p.shadow,
            "stroke-width": Math.max(2, hubR * (0.14 - tier * 0.04)),
            opacity: 0.55 - tier * 0.12,
            "stroke-linecap": "round",
          }));
        }
      }
      for (let i = 0; i < 3; i++) {
        const a = gapCenterAngle(i * 2, 6, phase);
        appendRaisedBoss(g, geom, cx + Math.cos(a) * bridgeR, cy + Math.sin(a) * bridgeR, hubR * 0.5, finish);
        appendNestedGear(g, geom, cx + Math.cos(a) * bridgeR, cy + Math.sin(a) * bridgeR, 7, hubR * 0.4, a, finish, { hollow: true });
      }
    },
  },
  {
    id: "concentric-hub",
    spokes: 5,
    draw(g, geom, finish) {
      appendHollowAnnulus(g, geom, geom.cx, geom.cy, geom.innerR * 0.88, geom.hubR * 1.3, finish, { through: false });
      appendInnerToothRing(g, geom, finish, 0.88);
    },
    drawHub(g, geom, finish) {
      const { cx, cy, hubR } = geom;
      const p = depthPalette(finish);
      const steps = [1, 0.82, 0.64, 0.46, 0.28];
      steps.forEach((t, i) => {
        const r = hubR * t;
        if (i % 2 === 0) {
          appendRaisedBoss(g, geom, cx, cy, r, finish, { gloss: 0.04 + i * 0.01 });
        } else if (i < steps.length - 1) {
          appendHollowAnnulus(g, geom, cx, cy, hubR * steps[i - 1], r, finish, { through: false });
        }
      });
      appendHollowAnnulus(g, geom, cx, cy, hubR * 0.3, hubR * 0.1, finish, { through: false });
    },
  },
  {
    id: "curved-quad",
    spokes: 4,
    curvedSpokes: true,
    draw(g, geom, finish, rng) {
      const { cx, cy, hubR, innerR, phase } = geom;
      appendInnerToothRing(g, geom, finish, 0.9);
      const mid = midFaceRadius(geom) * 0.78;
      for (let i = 0; i < 4; i++) {
        const a = gapCenterAngle(i, 4, phase);
        const px = cx + Math.cos(a) * mid;
        const py = cy + Math.sin(a) * mid;
        appendRaisedBoss(g, geom, px, py, hubR * 0.52, finish);
        appendNestedGear(g, geom, px, py, 11, hubR * 0.44, a + rng() * 0.1, finish, { hollow: true, opacity: 0.88 });
      }
    },
  },
  {
    id: "clockwork-triple",
    spokes: 4,
    throughCutouts: true,
    draw(g, geom, finish, rng) {
      const { cx, cy, hubR, innerR, phase } = geom;
      appendSpokeGapVoids(g, geom, finish, 4, phase, { through: true });
      appendHollowAnnulus(g, geom, cx, cy, innerR * 0.9, hubR * 1.15, finish, { through: false });
      appendInnerToothRing(g, geom, finish, 0.85);
      appendRaisedBoss(g, geom, cx, cy, hubR * 0.52, finish, { bore: true, gloss: 0.1 });
      appendNestedGear(g, geom, cx, cy, 12, hubR * 0.44, phase, finish, { hollow: true, opacity: 0.92 });
      const orbit = hubR * 1.32;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + phase + Math.PI / 6;
        const px = cx + Math.cos(a) * orbit;
        const py = cy + Math.sin(a) * orbit;
        appendSectorVoid(g, geom, cx, cy, orbit * 0.55, orbit * 0.85, a - 0.35, a + 0.35, finish, { through: false });
        appendRaisedBoss(g, geom, px, py, hubR * 0.44, finish);
        appendNestedGear(g, geom, px, py, 8, hubR * 0.36, a + Math.PI / 2, finish, { hollow: true, opacity: 0.85 });
        appendNestedGear(g, geom, cx + Math.cos(a + 0.18) * (orbit * 0.7), cy + Math.sin(a + 0.18) * (orbit * 0.7),
          6, hubR * 0.26, a, finish, { hollow: true, opacity: 0.72 });
      }
    },
  },
  {
    id: "layered-plates",
    spokes: 4,
    throughCutouts: true,
    draw(g, geom, finish) {
      const { cx, cy, hubR, innerR, phase } = geom;
      const p = depthPalette(finish);
      appendSpokeGapVoids(g, geom, finish, 4, phase, { through: true });
      for (let pIdx = 0; pIdx < 3; pIdx++) {
        const r1 = hubR * (1.32 + pIdx * 0.2);
        const r2 = hubR * (1.52 + pIdx * 0.2);
        const span = Math.PI * 0.36;
        for (let i = 0; i < 4; i++) {
          const mid = gapCenterAngle(i, 4, phase);
          const a0 = mid - span / 2;
          const a1 = mid + span / 2;
          const x1 = cx + Math.cos(a0) * r1;
          const y1 = cy + Math.sin(a0) * r1;
          const x2 = cx + Math.cos(a1) * r1;
          const y2 = cy + Math.sin(a1) * r1;
          const x3 = cx + Math.cos(a1) * r2;
          const y3 = cy + Math.sin(a1) * r2;
          const x4 = cx + Math.cos(a0) * r2;
          const y4 = cy + Math.sin(a0) * r2;
          g.appendChild(el("path", {
            d: `M ${x1} ${y1} A ${r1} ${r1} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${r2} ${r2} 0 0 0 ${x4} ${y4} Z`,
            fill: `url(#${finish.raisedGradId})`,
            stroke: pIdx === 0 ? p.highlight : p.shadow,
            "stroke-width": 0.9 + pIdx * 0.15,
            opacity: 0.88 - pIdx * 0.1,
          }));
        }
      }
    },
  },
  {
    id: "star-hub",
    spokes: 6,
    draw(g, geom, finish, rng) {
      const { cx, cy, hubR, innerR, phase } = geom;
      appendSpokeGapVoids(g, geom, finish, 6, phase, { through: false });
      appendInnerToothRing(g, geom, finish, 0.9);
      const points = 6;
      const outer = hubR * 0.9;
      const inner = hubR * 0.36;
      const starPts = [];
      for (let i = 0; i < points * 2; i++) {
        const a = (i / (points * 2)) * Math.PI * 2 + phase - Math.PI / 2;
        const r = i % 2 === 0 ? outer : inner;
        starPts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
      }
      g.appendChild(el("polygon", {
        points: starPts.join(" "),
        fill: `url(#${finish.raisedGradId})`,
        stroke: depthPalette(finish).shadow,
        "stroke-width": 1.1,
        opacity: 0.92,
      }));
      appendHollowAnnulus(g, geom, cx, cy, hubR * 0.55, hubR * 0.22, finish, { through: false });
      for (let i = 0; i < 3; i++) {
        const a = gapCenterAngle(i * 2, 6, phase);
        appendRaisedBoss(g, geom, cx + Math.cos(a) * hubR * 1.55, cy + Math.sin(a) * hubR * 1.55, hubR * 0.48, finish);
        appendNestedGear(g, geom, cx + Math.cos(a) * hubR * 1.6, cy + Math.sin(a) * hubR * 1.6, 7, hubR * 0.4, a, finish, { hollow: true });
      }
    },
    drawHub(g, geom, finish) {
      appendRaisedBoss(g, geom, geom.cx, geom.cy, geom.hubR * 0.5, finish, { gloss: 0.06 });
    },
  },
  {
    id: "filigree-pocket",
    spokes: 4,
    throughCutouts: true,
    draw(g, geom, finish, rng) {
      const { cx, cy, hubR, innerR, phase } = geom;
      appendSpokeGapVoids(g, geom, finish, 4, phase, { through: true });
      appendHollowAnnulus(g, geom, cx, cy, innerR * 0.88, hubR * 1.22, finish, { through: false });
      appendHollowAnnulus(g, geom, cx, cy, innerR * 0.62, innerR * 0.38, finish, { through: false });
      appendInnerToothRing(g, geom, finish, 0.88);
      g.appendChild(el("path", {
        d: hubFiligreeRing(cx, cy, hubR * 0.9, 8, phase),
        fill: "none",
        stroke: depthPalette(finish).highlight,
        "stroke-width": Math.max(0.6, hubR * 0.05),
        opacity: 0.45,
        "stroke-linecap": "round",
      }));
      const mid = midFaceRadius(geom);
      for (let i = 0; i < 4; i++) {
        const a = phase + (i / 4) * Math.PI * 2 + Math.PI / 8;
        const px = cx + Math.cos(a) * mid * (0.82 + (i % 2) * 0.12);
        const py = cy + Math.sin(a) * mid * (0.82 + (i % 2) * 0.12);
        appendRaisedBoss(g, geom, px, py, hubR * 0.52, finish);
        appendNestedGear(g, geom, px, py, 7 + (i % 2) * 2, hubR * (0.48 - (i % 2) * 0.08), a, finish, { hollow: true, opacity: 0.88 });
      }
    },
    drawHub(g, geom, finish) {
      defaultDrawHub(g, geom, finish);
    },
  },
];

/* Surface weathering and random decor removed — they caused splotches and rim tick marks. */

function buildGear({ cx, cy, teeth, outerR, rootR, hubR, finish, design, id, phase = 0, decorRng = null, svgRoot = null }) {
  const cogDesign = design || COG_DESIGNS[0];
  const spokes = cogDesign.spokes ?? 6;
  const g = document.createElementNS(NS, "g");
  g.setAttribute("id", id);
  g.dataset.cx = cx;
  g.dataset.cy = cy;
  g.dataset.cogDesign = cogDesign.id;
  if (finish?.name) g.dataset.finish = finish.name;

  const stroke = finish.stroke;
  const teethFill = `url(#${finish.teethGradId})`;
  const faceFill = finish.faceGradId ? `url(#${finish.faceGradId})` : `url(#${finish.hubGradId})`;
  const spokeFill = finish.spokeSolid || `url(#${finish.hubGradId})`;
  const gearShape = gearPath(cx, cy, teeth, outerR, rootR, phase);
  const innerR = rootR * 0.78;
  const geom = makeGearGeom(cx, cy, outerR, rootR, hubR, phase, teeth);
  geom.cutouts = createCutoutRegistry();
  geom.throughCutouts = !!cogDesign.throughCutouts;

  if (svgRoot && finish) {
    ensureGearFinishGradients(svgRoot, id, finish, decorRng, cx, cy, outerR, rootR, hubR, phase, teeth);
  }

  const body = el("g");

  body.appendChild(el("path", {
    d: gearShape,
    fill: teethFill,
    stroke: "none",
  }));

  body.appendChild(el("circle", {
    cx, cy, r: innerR,
    fill: faceFill,
    stroke: "none",
    opacity: 0.92,
  }));

  if (cogDesign.draw) {
    cogDesign.draw(body, geom, finish, decorRng || seededRng(1));
  }

  const spokeW = Math.max(4, hubR * 0.3);
  const curved = cogDesign.curvedSpokes ?? false;
  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2 + phase;
    if (curved) {
      appendSpoke(body, cx, cy, angle, hubR, innerR, spokeFill, stroke, spokeW, decorRng, curved);
    } else {
      appendChamferedSpoke(body, cx, cy, angle, hubR, innerR, finish, spokeW);
    }
  }

  if (cogDesign.drawHub) {
    cogDesign.drawHub(body, geom, finish, decorRng);
  } else {
    defaultDrawHub(body, geom, finish);
  }

  if (svgRoot && geom.cutouts.all.length > 0) {
    ensureGearMask(svgRoot, id, gearShape, geom.cutouts.all);
    body.setAttribute("mask", `url(#${gearMaskId(id)})`);
  }

  g.appendChild(body);
  return g;
}

function gradStop(offset, color, opacity = 1) {
  const s = document.createElementNS(NS, "stop");
  s.setAttribute("offset", offset);
  s.setAttribute("stop-color", color);
  if (opacity < 1) s.setAttribute("stop-opacity", String(opacity));
  return s;
}

function ensureGearFinishGradients(svgRoot, gearId, finish, rng, cx, cy, outerR, rootR, hubR, phase, teeth) {
  const defs = svgRoot.querySelector("defs") || (() => {
    const d = document.createElementNS(NS, "defs");
    svgRoot.insertBefore(d, svgRoot.firstChild);
    return d;
  })();

  if (defs.querySelector(`#${finish.teethGradId}`)) return;

  const uid = gearId.replace(/[^a-z0-9-]/gi, "");
  const clipId = gearClipPathId(gearId);
  const cp = document.createElementNS(NS, "clipPath");
  cp.setAttribute("id", clipId);
  const cpPath = document.createElementNS(NS, "path");
  cpPath.setAttribute("d", gearPath(cx, cy, teeth, outerR, rootR, phase));
  cp.appendChild(cpPath);
  defs.appendChild(cp);

  const w = finish.weathering || {};
  const base = finish.base || brassFill;
  const hi = w.highlight || base;
  const edge = w.grime || "#2a2010";

  const tg = document.createElementNS(NS, "radialGradient");
  tg.setAttribute("id", finish.teethGradId);
  tg.setAttribute("gradientUnits", "userSpaceOnUse");
  tg.setAttribute("cx", String(cx - outerR * 0.12));
  tg.setAttribute("cy", String(cy - outerR * 0.15));
  tg.setAttribute("r", String(outerR * 1.1));
  const tStops = finish.teethStops || [];
  const teethHi = tStops[0]?.[1] || hi;
  const teethMid = tStops[Math.floor(tStops.length / 2)]?.[1] || base;
  const teethEdge = tStops[tStops.length - 1]?.[1] || edge;
  [
    ["0%", teethHi, 0.95],
    ["42%", teethMid],
    ["100%", teethEdge, 0.9],
  ].forEach(([o, c, op]) => tg.appendChild(gradStop(o, c, op ?? 1)));
  defs.appendChild(tg);

  const hg = document.createElementNS(NS, "radialGradient");
  hg.setAttribute("id", finish.hubGradId);
  hg.setAttribute("gradientUnits", "userSpaceOnUse");
  hg.setAttribute("cx", String(cx - hubR * 0.3));
  hg.setAttribute("cy", String(cy - hubR * 0.35));
  hg.setAttribute("r", String(hubR * 1.4));
  finish.hubStops.forEach(([o, c, op]) => hg.appendChild(gradStop(o, c, op ?? 1)));
  defs.appendChild(hg);

  finish.faceGradId = `gf-face-${uid}`;
  const fg = document.createElementNS(NS, "radialGradient");
  fg.setAttribute("id", finish.faceGradId);
  fg.setAttribute("gradientUnits", "userSpaceOnUse");
  fg.setAttribute("cx", String(cx));
  fg.setAttribute("cy", String(cy));
  fg.setAttribute("r", String(rootR * 0.95));
  const smoothFace = [
    ["0%", hi, 0.92],
    ["40%", base],
    ["78%", base, 0.9],
    ["100%", edge, 0.85],
  ];
  smoothFace.forEach(([o, c, op]) => fg.appendChild(gradStop(o, c, op ?? 1)));
  defs.appendChild(fg);

  const p = depthPalette(finish);
  finish.recessGradId = `gf-recess-${uid}`;
  finish.raisedGradId = `gf-raised-${uid}`;
  finish.voidGradId = `gf-void-${uid}`;

  const rg = document.createElementNS(NS, "radialGradient");
  rg.setAttribute("id", finish.recessGradId);
  rg.setAttribute("gradientUnits", "userSpaceOnUse");
  rg.setAttribute("cx", String(cx + rootR * 0.08));
  rg.setAttribute("cy", String(cy + rootR * 0.1));
  rg.setAttribute("r", String(rootR * 0.85));
  [
    ["0%", p.pit, 0.95],
    ["55%", p.recess],
    ["100%", p.base, 0.75],
  ].forEach(([o, c, op]) => rg.appendChild(gradStop(o, c, op ?? 1)));
  defs.appendChild(rg);

  const raise = document.createElementNS(NS, "radialGradient");
  raise.setAttribute("id", finish.raisedGradId);
  raise.setAttribute("gradientUnits", "userSpaceOnUse");
  raise.setAttribute("cx", String(cx - hubR * 0.28));
  raise.setAttribute("cy", String(cy - hubR * 0.32));
  raise.setAttribute("r", String(rootR * 0.9));
  [
    ["0%", p.highlight, 0.88],
    ["38%", p.raised],
    ["72%", p.base],
    ["100%", p.shadow, 0.8],
  ].forEach(([o, c, op]) => raise.appendChild(gradStop(o, c, op ?? 1)));
  defs.appendChild(raise);

  const vg = document.createElementNS(NS, "radialGradient");
  vg.setAttribute("id", finish.voidGradId);
  vg.setAttribute("gradientUnits", "userSpaceOnUse");
  vg.setAttribute("cx", String(cx));
  vg.setAttribute("cy", String(cy));
  vg.setAttribute("r", String(hubR * 1.2));
  [
    ["0%", p.void, 1],
    ["70%", p.shadow, 0.95],
    ["100%", p.shadow, 0.85],
  ].forEach(([o, c, op]) => vg.appendChild(gradStop(o, c, op ?? 1)));
  defs.appendChild(vg);
}

function ensureHeatGradient(svgRoot) {
  if (svgRoot.querySelector("#heat-disc")) return;
  const defs = svgRoot.querySelector("defs") || document.createElementNS(NS, "defs");
  if (!svgRoot.querySelector("defs")) svgRoot.insertBefore(defs, svgRoot.firstChild);
  const grad = document.createElementNS(NS, "radialGradient");
  grad.setAttribute("id", "heat-disc");
  grad.appendChild(gradStop("0%", "#ff6a20", 0.5));
  grad.appendChild(gradStop("100%", "#ff6a20", 0));
  defs.appendChild(grad);
}

/* ---------- Palette + metal finishes ---------------------------------- */
const brassFill = "#b08d57";
const brassStroke = "#3a2a14";
const copperFill = "#b87333";
const copperStroke = "#4a2810";
const goldFill = "#d4af37";
const goldStroke = "#5a4014";

function pickGearFinish(rng, gearId) {
  const uid = gearId.replace(/[^a-z0-9-]/gi, "");
  const finishes = [
    {
      name: "polished-gold", base: goldFill, stroke: goldStroke, specular: 1,
      teethStops: [["0%", "#fff8dc"], ["18%", "#ffe566"], ["45%", goldFill], ["72%", "#a88830"], ["100%", "#4a3810"]],
      hubStops: [["0%", "#fff0a0"], ["35%", goldFill], ["100%", "#4a3810"]],
      faceStops: [["0%", "#ffe566", 0.85], ["30%", goldFill], ["60%", "#b89840"], ["100%", "#3a2810", 0.9]],
      weathering: { patina: "#5a6848", rust: "#6a5020", grime: "#2a2010", highlight: "#fff0a0", intensity: 0.35 },
      strokeWidth: "1.2",
    },
    {
      name: "mirror-copper", base: copperFill, stroke: copperStroke, specular: 0.95,
      teethStops: [["0%", "#ffd4a8"], ["15%", "#e89850"], ["42%", copperFill], ["70%", "#8a5028"], ["100%", "#2a1008"]],
      hubStops: [["0%", "#ffc890"], ["40%", "#c87830"], ["100%", "#2a1008"]],
      faceStops: [["0%", "#ffc890", 0.9], ["28%", copperFill], ["58%", "#8a5028"], ["100%", "#1a0805", 0.88]],
      weathering: { patina: "#3a6858", rust: "#7a4020", grime: "#1a0a05", highlight: "#ffd4a8", intensity: 0.4 },
      strokeWidth: "1.2",
    },
    {
      name: "bright-brass", base: brassFill, stroke: brassStroke, specular: 0.85,
      teethStops: [["0%", "#f5e6c8"], ["22%", "#d4b070"], ["50%", brassFill], ["75%", "#7a6038"], ["100%", "#3a2818"]],
      hubStops: [["0%", "#e8d0a0"], ["45%", brassFill], ["100%", "#3a2814"]],
      faceStops: [["0%", "#e8d0a0"], ["35%", brassFill], ["65%", "#6a5030"], ["100%", "#2a1810", 0.85]],
      weathering: { patina: "#4a5840", rust: "#6a4828", grime: "#1a120a", highlight: "#f5e6c8", intensity: 0.45 },
    },
    {
      name: "tarnished-brass", base: "#7a6340", stroke: "#3a2a14", specular: 0.15,
      teethStops: [["0%", "#9a8460"], ["28%", "#6a5438"], ["55%", "#5a4830"], ["80%", "#3a3020"], ["100%", "#1a1810"]],
      hubStops: [["0%", "#8a7450"], ["55%", "#5a4830"], ["100%", "#2a2010"]],
      faceStops: [["0%", "#8a7450", 0.7], ["30%", "#5a4830"], ["55%", "#3d6b5a", 0.8], ["100%", "#1a1810", 0.9]],
      weathering: { patina: "#3d8a78", rust: "#7a5030", grime: "#1a120a", highlight: "#9a8460", intensity: 0.75 },
      patinaStops: [["0%", "#4a7868", 0.55], ["100%", "#4a7868", 0]],
    },
    {
      name: "rusted-iron", base: "#6b3a28", stroke: "#2a1810", specular: 0.05,
      teethStops: [["0%", "#8b5040"], ["20%", "#6b3828"], ["48%", "#4a2818"], ["75%", "#3a2010"], ["100%", "#1a0805"]],
      hubStops: [["0%", "#7a4430"], ["48%", "#4a2818"], ["100%", "#1a0a05"]],
      faceStops: [["0%", "#7a4430"], ["25%", "#5a3020"], ["50%", "#8b4513", 0.85], ["100%", "#0a0503", 0.95]],
      weathering: { patina: "#4a3828", rust: "#a05830", grime: "#0a0503", highlight: "#8b5040", intensity: 0.9 },
      spokeSolid: "#5a3020",
      patinaStops: [["0%", "#8b4513", 0.5], ["60%", "#4a2010", 0.25], ["100%", "#4a2010", 0]],
      textureOpacity: 0.55,
    },
    {
      name: "verdigris-copper", base: "#4a6858", stroke: "#2a3830", specular: 0.1,
      teethStops: [["0%", "#7aaa98"], ["20%", "#4a9888"], ["45%", "#3a7868"], ["70%", "#2a5848"], ["100%", "#0a1810"]],
      hubStops: [["0%", "#5a9888"], ["45%", "#3a6858"], ["100%", "#1a2820"]],
      faceStops: [["0%", "#6a9888", 0.75], ["25%", "#3a7868"], ["50%", "#2a6858", 0.9], ["75%", "#c89848", 0.45], ["100%", "#1a2820", 0.9]],
      weathering: { patina: "#2a8878", rust: "#6a4828", grime: "#0a1810", highlight: "#8ab8a8", intensity: 0.95 },
      patinaStops: [["0%", "#2a8878", 0.6], ["50%", "#1a5048", 0.35], ["100%", "#1a4038", 0]],
      textureOpacity: 0.5,
    },
    {
      name: "oxidized-gold", base: "#8a7840", stroke: "#4a4020", specular: 0.12,
      teethStops: [["0%", "#a89858"], ["35%", "#7a6838"], ["62%", "#5a4828"], ["85%", "#3a3820"], ["100%", "#1a1008"]],
      hubStops: [["0%", "#988848"], ["50%", "#6a5828"], ["100%", "#3a2810"]],
      faceStops: [["0%", "#988848"], ["40%", "#6a5838"], ["65%", "#3a6858", 0.7], ["100%", "#1a1008", 0.9]],
      weathering: { patina: "#3a6858", rust: "#6a4820", grime: "#1a1008", highlight: "#c8b060", intensity: 0.7 },
      patinaStops: [["0%", "#3a6858", 0.45], ["100%", "#3a5038", 0]],
    },
    {
      name: "oil-stained-brass", base: "#5a4828", stroke: "#2a2010", specular: 0.25,
      teethStops: [["0%", "#7a6848"], ["15%", "#2a1810"], ["38%", brassFill], ["62%", "#3a2818"], ["85%", "#1a1008"], ["100%", "#0a0805"]],
      hubStops: [["0%", "#6a5840"], ["38%", "#2a1810"], ["100%", "#0a0805"]],
      faceStops: [["0%", "#6a5840"], ["22%", "#2a1810", 0.9], ["48%", brassFill, 0.8], ["100%", "#0a0805", 0.95]],
      weathering: { patina: "#2a2018", rust: "#5a3820", grime: "#050403", highlight: "#8a7850", intensity: 0.8 },
      spokeSolid: "#4a3820",
    },
    {
      name: "pitted-bronze", base: "#6a5030", stroke: "#3a2814", specular: 0.08,
      teethStops: [["0%", "#8a6840"], ["30%", "#5a4028"], ["58%", "#4a3820"], ["82%", "#3a2818"], ["100%", "#1a1008"]],
      hubStops: [["0%", "#7a5838"], ["48%", "#4a3820"], ["100%", "#2a1810"]],
      faceStops: [["0%", "#7a5838"], ["35%", "#4a3820"], ["60%", "#3a5048", 0.75], ["100%", "#1a1008", 0.92]],
      weathering: { patina: "#3a5850", rust: "#7a4828", grime: "#1a1008", highlight: "#9a7848", intensity: 0.85 },
      patinaStops: [["0%", "#3a4840", 0.4], ["100%", "#2a2018", 0]],
      textureOpacity: 0.45,
    },
    {
      name: "aged-copper", base: "#7a5038", stroke: "#3a2010", specular: 0.2,
      teethStops: [["0%", "#a07048"], ["25%", copperFill], ["52%", "#6a4028"], ["78%", "#4a2818"], ["100%", "#1a0805"]],
      hubStops: [["0%", "#906040"], ["42%", "#6a4028"], ["100%", "#2a1008"]],
      faceStops: [["0%", "#a07048"], ["30%", copperFill], ["55%", "#3a7868", 0.8], ["100%", "#1a0805", 0.9]],
      weathering: { patina: "#3a8878", rust: "#8a5028", grime: "#1a0805", highlight: "#c89058", intensity: 0.75 },
      patinaStops: [["0%", "#3a8878", 0.4], ["80%", "#2a5848", 0]],
    },
    {
      name: "relic-verdigris", base: "#5a9888", stroke: "#2a3830", specular: 0.18,
      teethStops: [["0%", "#c8b060"], ["15%", "#5a9888"], ["40%", "#3a7868"], ["65%", "#2a6858"], ["85%", "#c89848"], ["100%", "#1a2820"]],
      hubStops: [["0%", "#d4af37"], ["35%", "#4a8878"], ["100%", "#1a2820"]],
      faceStops: [["0%", "#d4af37", 0.7], ["20%", "#4a9888"], ["45%", "#2a7868", 0.95], ["70%", "#c89848", 0.55], ["100%", "#1a2010", 0.9]],
      weathering: { patina: "#3a9888", rust: "#a05828", grime: "#1a1810", highlight: "#ffe566", intensity: 1 },
      patinaStops: [["0%", "#3a9888", 0.65], ["45%", "#2a6858", 0.4], ["100%", "#1a4038", 0]],
      textureOpacity: 0.55,
    },
  ];

  const f = pick(rng, finishes);
  return {
    ...f,
    teethGradId: `gf-teeth-${uid}`,
    hubGradId: `gf-hub-${uid}`,
    recessGradId: `gf-recess-${uid}`,
    raisedGradId: `gf-raised-${uid}`,
    voidGradId: `gf-void-${uid}`,
    patinaGradId: f.patinaStops ? `gf-patina-${uid}` : null,
  };
}

/* ---------- Meshing-gear chains (viewport height) --------------------- */
const COL_W = 220;
const TOOTH_PITCH = 14;
const ADDENDUM = TOOTH_PITCH / Math.PI;
const DEDENDUM = ADDENDUM * 1.25;

function gearGeom(teeth) {
  const pitchR = (teeth * TOOTH_PITCH) / (2 * Math.PI);
  return {
    teeth,
    pitchR,
    outerR: pitchR + ADDENDUM,
    rootR: Math.max(6, pitchR - DEDENDUM),
  };
}

function nearestToothMidpoint(phase, N, target) {
  const firstMid = phase + Math.PI / (4 * N);
  const step = (2 * Math.PI) / N;
  const k = Math.round((target - firstMid) / step);
  return firstMid + k * step;
}

function phaseForGapAt(angle, N) {
  return angle - (5 * Math.PI) / (4 * N);
}

function tryPlaceNext(prev, cxMin, cxMax, yEnd, rng) {
  const preferred = 8 + Math.floor(rng() * 24);
  const toothOffsets = [0, -3, 3, -6, 6, -10, 10, -14, 14, -18, 18];
  for (const off of toothOffsets) {
    const teeth = Math.max(6, Math.min(40, preferred + off));
    const geom = gearGeom(teeth);
    const d = prev.pitchR + geom.pitchR;
    for (let attempt = 0; attempt < 8; attempt++) {
      const target = Math.PI / 2 + (rng() - 0.5) * 1.6;
      const angle = nearestToothMidpoint(prev.phase, prev.teeth, target);
      const cx = prev.cx + Math.cos(angle) * d;
      const cy = prev.cy + Math.sin(angle) * d;
      if (cx < cxMin || cx > cxMax) continue;
      if (cy <= prev.cy + 3) continue;
      if (cy + geom.outerR > yEnd) return { done: true };
      const phase = phaseForGapAt(angle + Math.PI, teeth);
      return {
        cog: { teeth, pitchR: geom.pitchR, outerR: geom.outerR, rootR: geom.rootR, cx, cy, phase },
      };
    }
  }
  return { failed: true };
}

function buildMeshingChain(side, yStart, yEnd, seed) {
  const rng = seededRng(seed);
  const cxMin = side === "left" ? -10 : 90;
  const cxMax = side === "left" ? 130 : 230;

  const seedTeeth = 14 + Math.floor(rng() * 10);
  const seedGeom = gearGeom(seedTeeth);
  const seedCx = cxMin + 20 + rng() * Math.max(0, cxMax - cxMin - 40);
  const anchor = {
    teeth: seedTeeth,
    pitchR: seedGeom.pitchR,
    outerR: seedGeom.outerR,
    rootR: seedGeom.rootR,
    cx: seedCx,
    cy: yStart + seedGeom.outerR + 10,
    phase: rng() * Math.PI * 2,
  };
  const chain = [anchor];
  for (let safety = 0; safety < 600; safety++) {
    const res = tryPlaceNext(chain[chain.length - 1], cxMin, cxMax, yEnd, rng);
    if (res.done || res.failed) break;
    chain.push(res.cog);
  }
  return chain;
}

const leftSvg = document.getElementById("cog-svg-left");
const rightSvg = document.getElementById("cog-svg-right");
const cogTweens = [];

function killCogTweens() {
  while (cogTweens.length) cogTweens.pop().kill();
}

function readCssPx(varName, fallback) {
  const raw = getComputedStyle(document.body).getPropertyValue(varName).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function populateCogColumn(svgEl, side) {
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  const vh = window.innerHeight;
  // Stacks are temporarily disabled; let the right cog chain run the full
  // height like the left side instead of leaving its reserved smokestack zone.
  const yStart = readCssPx(
    side === "left" ? "--cog-y-start-left" : "--cog-y-start-right",
    side === "left" ? 120 : 10,
  );
  const yEnd = vh - 30;

  svgEl.setAttribute("viewBox", `0 0 ${COL_W} ${vh}`);
  svgEl.style.height = "100%";

  ensureHeatGradient(svgEl);

  const seed = side === "left" ? 7711 : 9923;
  const chain = buildMeshingChain(side, yStart, yEnd, seed);

  const cogs = [];
  chain.forEach((cog, i) => {
    const id = `cog-${side}-${i}`;
    const decorRng = seededRng(seed + i * 97);
    const finish = pickGearFinish(decorRng, id);
    const design = COG_DESIGNS[Math.floor(decorRng() * COG_DESIGNS.length)];
    const g = buildGear({
      cx: cog.cx,
      cy: cog.cy,
      teeth: cog.teeth,
      outerR: cog.outerR,
      rootR: cog.rootR,
      hubR: Math.max(6, cog.pitchR * 0.22),
      finish,
      design,
      id,
      phase: cog.phase,
      decorRng,
      svgRoot: svgEl,
    });
    svgEl.appendChild(g);
    cogs.push({ id, r: cog.outerR, cx: cog.cx, cy: cog.cy });
  });
  return cogs;
}

const REFERENCE_PAGE_MIN_VH = 250;
const REFERENCE_BASE_TURNS = 2;

function getPageMinHeightVh() {
  const raw = getComputedStyle(document.body).getPropertyValue("--page-min-height").trim();
  const match = /^([\d.]+)vh$/i.exec(raw);
  return match ? parseFloat(match[1]) : REFERENCE_PAGE_MIN_VH;
}

function attachCogRotation(cogs) {
  const referenceR = 50;
  const pageMinVh = getPageMinHeightVh();
  const scrollRangeRatio = (pageMinVh - 100) / (REFERENCE_PAGE_MIN_VH - 100);
  const baseTurns = REFERENCE_BASE_TURNS * scrollRangeRatio;
  cogs.forEach((cog, idx) => {
    const direction = idx % 2 === 0 ? 1 : -1;
    const rotation = direction * baseTurns * 360 * (referenceR / cog.r);
    const tw = gsap.to(`#${cog.id}`, {
      rotation,
      svgOrigin: `${cog.cx} ${cog.cy}`,
      ease: "none",
      scrollTrigger: {
        trigger: "body",
        start: "top top",
        end: "bottom bottom",
        scrub: 0.4,
      },
    });
    cogTweens.push(tw);
  });
}

function buildAllCogColumns() {
  killCogTweens();
  const leftCogs = populateCogColumn(leftSvg, "left");
  const rightCogs = populateCogColumn(rightSvg, "right");
  attachCogRotation(leftCogs);
  attachCogRotation(rightCogs);
}

/* ---------- Procedural smokestacks ------------------------------------ */
const PIPE_TEXTURES = [
  {
    name: "polished-brass",
    shaft: ["#2a1f10", "#6b4f28", "#d4c090", "#c9a96a", "#b08d57", "#6b4f28", "#1a120a"],
    cap: ["#2a1f10", "#c9a96a", "#f0e0c0", "#c9a96a", "#1a120a"],
    sheen: 0.35,
  },
  {
    name: "tarnished-copper",
    shaft: ["#1a1008", "#4a2818", "#8a5838", "#6a4028", "#4a2818", "#2a1808", "#0a0805"],
    cap: ["#2a1808", "#7a5030", "#9a6840", "#5a3820", "#1a1008"],
    sheen: 0.08,
    patina: true,
  },
  {
    name: "soot-blackened",
    shaft: ["#0a0805", "#1a1612", "#2a2420", "#1a1612", "#121010", "#0a0805", "#050403"],
    cap: ["#0a0805", "#2a2420", "#3a3430", "#1a1612", "#050403"],
    sheen: 0.05,
    sootHeavy: true,
  },
  {
    name: "rust-streaked",
    shaft: ["#1a0a05", "#4a2010", "#8b4513", "#6b3828", "#4a2818", "#3a2010", "#1a0a05"],
    cap: ["#2a1008", "#7a4020", "#a05830", "#5a3018", "#1a0a05"],
    sheen: 0.06,
    rustHeavy: true,
  },
  {
    name: "verdigris-patina",
    shaft: ["#1a2820", "#2a4840", "#4a7868", "#3a6858", "#2a5048", "#1a3830", "#0a1810"],
    cap: ["#1a2820", "#3a6858", "#5a9888", "#3a5848", "#0a1810"],
    sheen: 0.12,
    patina: true,
  },
  {
    name: "weathered-iron",
    shaft: ["#121010", "#3a3430", "#5a5048", "#4a4440", "#3a3430", "#2a2420", "#0a0805"],
    cap: ["#1a1612", "#4a4440", "#6a6058", "#3a3430", "#0a0805"],
    sheen: 0.04,
  },
  {
    name: "mirror-copper-pipe",
    shaft: ["#1a0a05", "#5a3018", "#d89858", "#e8a868", "#b87333", "#5a3018", "#1a0a05"],
    cap: ["#2a1008", "#c87830", "#ffc890", "#c87830", "#1a0a05"],
    sheen: 0.45,
  },
  {
    name: "oxidized-brass",
    shaft: ["#1a120a", "#3a2a14", "#6a5438", "#4a4030", "#3a3428", "#2a2018", "#0a0805"],
    cap: ["#2a2018", "#6a5438", "#8a7450", "#4a4030", "#1a120a"],
    sheen: 0.1,
    patina: true,
  },
];

function pipeGradient(colors, angle = 90) {
  const stops = colors.map((c, i) => `${c} ${Math.round((i / (colors.length - 1)) * 100)}%`).join(", ");
  return `linear-gradient(${angle}deg, ${stops})`;
}

function buildSmokestack(stackEl, seed) {
  stackEl.innerHTML = "";
  const rng = seededRng(seed);
  const isTall = stackEl.classList.contains("stack-a");
  const tex = pick(rng, PIPE_TEXTURES);

  stackEl.dataset.pipeTexture = tex.name;
  stackEl.style.setProperty("--pipe-sheen", String(tex.sheen));

  const seamStripe = "repeating-linear-gradient(180deg, transparent 0, transparent 56px, rgba(0,0,0,0.45) 56px, rgba(0,0,0,0.45) 58px, transparent 58px, transparent 60px)";
  const shaft = document.createElement("div");
  shaft.className = "pipe-shaft";
  shaft.style.background = `${seamStripe}, ${pipeGradient(tex.shaft, 90)}, ${pipeGradient(tex.shaft.slice().reverse(), 88)}`;
  if (tex.patina) shaft.classList.add("pipe-shaft--patina");
  if (tex.sootHeavy) shaft.classList.add("pipe-shaft--soot");
  if (tex.rustHeavy) shaft.classList.add("pipe-shaft--rust");

  const cap = document.createElement("div");
  cap.className = "pipe-cap";
  cap.style.background = `${pipeGradient(tex.cap, 90)}, radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.55) 0%, transparent 60%)`;

  const details = document.createElement("div");
  details.className = "stack-details";

  const flangeCount = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < flangeCount; i++) {
    const flange = document.createElement("div");
    flange.className = "pipe-flange";
    flange.style.bottom = `${12 + rng() * (isTall ? 55 : 40)}%`;
    flange.style.left = `${-8 - rng() * 6}px`;
    flange.style.right = `${-8 - rng() * 6}px`;
    flange.style.height = `${10 + rng() * 8}px`;
    if (rng() > 0.5) flange.classList.add("flange-riveted");
    details.appendChild(flange);
  }

  const rivetRows = 3 + Math.floor(rng() * 5);
  for (let r = 0; r < rivetRows; r++) {
    const row = document.createElement("div");
    row.className = "rivet-row";
    row.style.bottom = `${8 + r * (70 / rivetRows) + rng() * 4}%`;
    const count = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const rivet = document.createElement("span");
      rivet.className = "rivet";
      row.appendChild(rivet);
    }
    details.appendChild(row);
  }

  if (rng() > 0.3) {
    const ladder = document.createElement("div");
    ladder.className = "pipe-ladder";
    const rungs = 4 + Math.floor(rng() * 6);
    for (let i = 0; i < rungs; i++) {
      const rung = document.createElement("span");
      rung.className = "ladder-rung";
      rung.style.bottom = `${10 + i * (60 / rungs)}%`;
      ladder.appendChild(rung);
    }
    details.appendChild(ladder);
  }

  if (rng() > 0.4) {
    const valve = document.createElement("div");
    valve.className = "pipe-valve";
    valve.style.bottom = `${20 + rng() * 35}%`;
    valve.style.left = `${rng() > 0.5 ? -18 : 72}%`;
    valve.innerHTML = '<span class="valve-wheel"></span><span class="valve-stem"></span>';
    details.appendChild(valve);
  }

  if (rng() > 0.35) {
    const gauge = document.createElement("div");
    gauge.className = "pipe-mini-gauge";
    gauge.style.bottom = `${25 + rng() * 40}%`;
    gauge.style.right = `${-12 - rng() * 8}px`;
    gauge.innerHTML = '<span class="mini-gauge-face"></span><span class="mini-gauge-needle"></span>';
    details.appendChild(gauge);
  }

  if (rng() > 0.25) {
    const plaque = document.createElement("div");
    plaque.className = "pipe-plaque";
    plaque.style.bottom = `${15 + rng() * 25}%`;
    plaque.textContent = pick(rng, ["HIGH PRESS", "CAUTION", "STEAM", "№ VII", "BOILER"]);
    details.appendChild(plaque);
  }

  const rustCount = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < rustCount; i++) {
    const rust = document.createElement("div");
    rust.className = "pipe-rust";
    rust.style.bottom = `${5 + rng() * 50}%`;
    rust.style.left = `${rng() * 30}%`;
    rust.style.height = `${20 + rng() * 40}px`;
    rust.style.opacity = `${0.2 + rng() * 0.35}`;
    details.appendChild(rust);
  }

  if (rng() > 0.45) {
    const bundle = document.createElement("div");
    bundle.className = "condenser-bundle";
    bundle.style.bottom = `${30 + rng() * 25}%`;
    const pipes = 2 + Math.floor(rng() * 3);
    for (let p = 0; p < pipes; p++) {
      const cp = document.createElement("span");
      cp.className = "condenser-pipe";
      cp.style.left = `${p * 14}px`;
      bundle.appendChild(cp);
    }
    details.appendChild(bundle);
  }

  const soot = document.createElement("div");
  soot.className = "pipe-soot";
  if (tex.sootHeavy) soot.classList.add("pipe-soot--heavy");
  details.appendChild(soot);

  if (tex.patina) {
    const patina = document.createElement("div");
    patina.className = "pipe-patina-overlay";
    patina.style.opacity = `${0.25 + rng() * 0.25}`;
    details.appendChild(patina);
  }

  if (tex.rustHeavy) {
    const rustStreak = document.createElement("div");
    rustStreak.className = "pipe-rust-streak";
    rustStreak.style.height = `${35 + rng() * 45}%`;
    rustStreak.style.left = `${10 + rng() * 40}%`;
    details.appendChild(rustStreak);
  }

  const origin = document.createElement("div");
  origin.className = "puff-origin";
  cap.appendChild(origin);

  stackEl.appendChild(shaft);
  stackEl.appendChild(details);
  stackEl.appendChild(cap);
}

/* TEMPORARILY DISABLED — smokestacks paused while we iterate on the pipe network.
document.querySelectorAll(".stack").forEach((stack) => {
  const id = stack.dataset.stackId || "a";
  buildSmokestack(stack, id === "a" ? 4401 : 8802);
});
*/

/* ---------- Pressure-gauge tool cards --------------------------------- */
const GAUGE_ANGLE_MIN = -130;
const GAUGE_ANGLE_MAX = 130;
const GAUGE_REST_ANGLE = GAUGE_ANGLE_MIN;

function readingToAngle(reading) {
  return GAUGE_ANGLE_MIN + (reading / 100) * (GAUGE_ANGLE_MAX - GAUGE_ANGLE_MIN);
}

function attachGaugeHover(gaugeEl, needleEl) {
  const state = { angle: GAUGE_REST_ANGLE };
  let activeTween = null;
  const hoverCapable = window.matchMedia("(hover: hover)").matches;

  const setNeedleAngle = (angle) => {
    state.angle = angle;
    needleEl.style.transform = `rotate(${angle}deg)`;
  };

  const activateHover = () => {
    if (activeTween) activeTween.kill();

    gaugeEl.classList.add("is-hovered");
    const targetAngle = readingToAngle(20 + Math.random() * 80);

    activeTween = gsap.to(state, {
      angle: targetAngle,
      duration: reducedMotion ? 0.15 : 1.1,
      ease: reducedMotion ? "none" : "elastic.out(1, 0.45)",
      onUpdate: () => setNeedleAngle(state.angle),
    });
  };

  const resetNeedle = () => {
    if (activeTween) {
      activeTween.kill();
      activeTween = null;
    }

    gaugeEl.classList.remove("is-hovered");
    activeTween = gsap.to(state, {
      angle: GAUGE_REST_ANGLE,
      duration: reducedMotion ? 0.15 : 0.45,
      ease: reducedMotion ? "none" : "power2.out",
      onUpdate: () => setNeedleAngle(state.angle),
    });
  };

  needleEl.removeAttribute("transform");
  setNeedleAngle(GAUGE_REST_ANGLE);

  if (hoverCapable) {
    gaugeEl.addEventListener("pointerenter", activateHover);
    gaugeEl.addEventListener("pointerleave", resetNeedle);
  } else {
    gaugeEl.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") activateHover();
    });
    gaugeEl.addEventListener("pointerup", (e) => {
      if (e.pointerType === "touch") {
        setTimeout(resetNeedle, 400);
      }
    });
    gaugeEl.addEventListener("pointercancel", resetNeedle);
  }
}

const comingSoonBanner = document.getElementById("coming-soon-banner");
let comingSoonHideTimer = null;

function showComingSoonBanner() {
  if (!comingSoonBanner) return;

  if (comingSoonHideTimer) {
    clearTimeout(comingSoonHideTimer);
    comingSoonHideTimer = null;
  }

  comingSoonBanner.hidden = false;
  requestAnimationFrame(() => {
    comingSoonBanner.classList.add("is-visible");
  });

  comingSoonHideTimer = setTimeout(() => {
    comingSoonBanner.classList.remove("is-visible");
    comingSoonHideTimer = setTimeout(() => {
      comingSoonBanner.hidden = true;
      comingSoonHideTimer = null;
    }, reducedMotion ? 0 : 350);
  }, 3000);
}

function onComingSoonClick(e) {
  e.preventDefault();
  showComingSoonBanner();
}

function activateGaugeLink(gaugeEl, url) {
  gaugeEl.href = url;
  gaugeEl.target = "_blank";
  gaugeEl.rel = "noopener noreferrer";
  gaugeEl.dataset.status = "live";
  gaugeEl.removeEventListener("click", onComingSoonClick);
}

const gaugesContainer = document.getElementById("gauges");
VALHALLA_LINKS.forEach((link) => {
  const a = document.createElement("a");
  a.className = "gauge";
  a.dataset.status = link.status;
  a.dataset.linkId = link.id;

  if (hasNavigableUrl(link)) {
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  } else {
    a.href = "#";
    a.addEventListener("click", onComingSoonClick);
  }

  a.innerHTML = `
    <div class="gauge-face">
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <g stroke="#c9a96a" stroke-width="2" fill="none">
          ${tickMarks(100, 100, 78, -130, 130, 11)}
        </g>
        <g stroke="#7a5e36" stroke-width="1" fill="none">
          ${tickMarks(100, 100, 78, -130, 130, 41, 5)}
        </g>
        <g fill="#c9a96a" font-family="Cinzel, serif" font-size="11" text-anchor="middle">
          <text x="40"  y="115">0</text>
          <text x="100" y="38">50</text>
          <text x="160" y="115">100</text>
        </g>
        <g class="gauge-needle">
          <line x1="100" y1="100" x2="100" y2="38" stroke="#ff7a18" stroke-width="3" stroke-linecap="round"/>
          <line x1="100" y1="100" x2="100" y2="118" stroke="#ff7a18" stroke-width="3" stroke-linecap="round"/>
          <circle cx="100" cy="100" r="6" fill="#1a120a" stroke="#d4af37" stroke-width="2"/>
        </g>
      </svg>
      <span class="gauge-rim-glow" aria-hidden="true"></span>
      <span class="gauge-glyph">${link.title}</span>
    </div>
  `;

  attachGaugeHover(a, a.querySelector(".gauge-needle"));
  gaugesContainer.appendChild(a);
});

fetchTrendlineUrl().then((url) => {
  if (!url) return;
  const gauge = gaugesContainer.querySelector('[data-link-id="trendline"]');
  if (gauge) activateGaugeLink(gauge, url);
});

const gaugesHubEl = document.querySelector(".gauges-hub");
const gaugePipeSvg = document.getElementById("gauge-pipe-network");
if (gaugesHubEl && gaugePipeSvg) {
  attachGaugePipeNetwork({ hubEl: gaugesHubEl, svgEl: gaugePipeSvg });
}

/* ---------- Steam valves: turn → vent (close overlaps end) ------------ */
const steamLayerEl = document.querySelector(".steam-fluid-layer");

const fluidSteam =
  steamLayerEl && gaugePipeSvg
    ? createFluidSteam({
        layer: steamLayerEl,
        getOriginElements: () => [...gaugePipeSvg.querySelectorAll(".valve-vent")],
        reducedMotion,
      })
    : null;

const valveTimers = [];
const valveTweens = [];

function clearValveCycles() {
  while (valveTimers.length) clearTimeout(valveTimers.pop());
  while (valveTweens.length) valveTweens.pop().kill();
  if (fluidSteam) fluidSteam.clear();
}

function scheduleValve(wheel, idx, cx, cy) {
  const delay = 20000 + Math.random() * 40000; // 20–60s
  const t = setTimeout(() => runValveCycle(wheel, idx, cx, cy), delay);
  valveTimers.push(t);
}

function runValveCycle(wheel, idx, cx, cy) {
  // Alternate the turn direction per valve for variety; open then close.
  const openDeg = (idx % 2 === 0 ? 1 : -1) * 150;
  const origin = `${cx} ${cy}`;
  const STEAM_DURATION_S = 9;
  const CLOSE_DURATION_S = 2;
  const tl = gsap.timeline({
    onComplete: () => scheduleValve(wheel, idx, cx, cy),
  });
  // 1) wheel turns slowly (open)
  tl.to(wheel, { rotation: openDeg, svgOrigin: origin, duration: 2, ease: "power1.inOut" });
  // 2) steam issues from the side vent for ~9s
  tl.call(() => {
    if (fluidSteam) fluidSteam.burstAtVent(idx, { durationMs: STEAM_DURATION_S * 1000 });
  });
  tl.to({}, { duration: STEAM_DURATION_S - CLOSE_DURATION_S });
  // 3) wheel turns slowly back (close) while steam is still on; steam ends when close finishes
  tl.to(wheel, { rotation: 0, svgOrigin: origin, duration: CLOSE_DURATION_S, ease: "power1.inOut" });
  valveTweens.push(tl);
}

function setupValves() {
  if (!gaugePipeSvg) return;
  const wheels = [...gaugePipeSvg.querySelectorAll(".valve-wheel")];
  wheels.forEach((wheel, idx) => {
    const cx = parseFloat(wheel.dataset.cx);
    const cy = parseFloat(wheel.dataset.cy);
    gsap.set(wheel, { rotation: 0, svgOrigin: `${cx} ${cy}` });
    if (reducedMotion) return; // static wheels, no spin, no steam
    scheduleValve(wheel, idx, cx, cy);
  });
}

function initValves() {
  clearValveCycles();
  setupValves();
}

function tickMarks(cx, cy, r, startAngle, endAngle, count, length = 10) {
  let s = "";
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const a = (startAngle + (endAngle - startAngle) * t) * Math.PI / 180;
    const x1 = cx + Math.sin(a) * r;
    const y1 = cy - Math.cos(a) * r;
    const x2 = cx + Math.sin(a) * (r - length);
    const y2 = cy - Math.cos(a) * (r - length);
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  return s;
}

/* ---------- WebGL steam (phased, per-stack) --------------------------- */
/* TEMPORARILY DISABLED — steam paused while we iterate on the pipe network.
   The import for createFluidSteam and the .steam-fluid-layer CSS are kept in
   place so re-enabling is a pure uncomment.

const stacks = Array.from(document.querySelectorAll(".stack"));
const steamLayerEl = document.querySelector(".steam-fluid-layer");
const steamScheduleTimers = [];

function getPuffOrigins() {
  return stacks.map((s) => s.querySelector(".puff-origin")).filter(Boolean);
}

let fluidSteam = steamLayerEl
  ? createFluidSteam({
      layer: steamLayerEl,
      getOriginElements: getPuffOrigins,
      reducedMotion,
    })
  : null;

function clearSteamSchedulers() {
  steamScheduleTimers.forEach((t) => clearTimeout(t));
  steamScheduleTimers.length = 0;
}

function releaseSteam(stack) {
  if (!fluidSteam || reducedMotion) return;
  const idx = stacks.indexOf(stack);
  fluidSteam.burstAtStack(idx >= 0 ? idx : 0);
}

function scheduleSteamForStack(stack) {
  const delay =
    Math.random() < 0.12
      ? 22000 + Math.random() * 10000
      : 10000 + Math.random() * 10000;

  const t = setTimeout(() => {
    releaseSteam(stack);
    if (Math.random() < 0.06) {
      const other = stacks.find((s) => s !== stack);
      if (other) releaseSteam(other);
    }
    scheduleSteamForStack(stack);
  }, delay);
  steamScheduleTimers.push(t);
}

if (fluidSteam) {
  stacks.forEach((stack) => scheduleSteamForStack(stack));
  const initialSteamTimer = setTimeout(() => {
    releaseSteam(stacks[Math.floor(Math.random() * stacks.length)]);
  }, 3000 + Math.random() * 3000);
  steamScheduleTimers.push(initialSteamTimer);
}
*/

/* ---------- Init ------------------------------------------------------ */
requestAnimationFrame(() => {
  buildAllCogColumns();
  ScrollTrigger.refresh();
});

// The pipe network builds over a couple of animation frames; bind the valves
// once it has settled so the wheels exist in the DOM.
setTimeout(initValves, 400);

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    buildAllCogColumns();
    ScrollTrigger.refresh();
    /* TEMPORARILY DISABLED — stack/steam rebuild paused along with the visuals.
    clearSteamSchedulers();
    if (fluidSteam) fluidSteam.clear();
    stacks.forEach((stack) => {
      const id = stack.dataset.stackId || "a";
      buildSmokestack(stack, id === "a" ? 4401 : 8802);
    });
    if (fluidSteam) {
      fluidSteam.resize();
      stacks.forEach(scheduleSteamForStack);
    }
    */
    if (gaugesHubEl && gaugePipeSvg) {
      buildGaugePipeNetwork({ hubEl: gaugesHubEl, svgEl: gaugePipeSvg });
      if (fluidSteam) fluidSteam.resize();
      // Network was rebuilt with fresh valve nodes — rebind the cycles.
      initValves();
    }
  }, 200);
});
