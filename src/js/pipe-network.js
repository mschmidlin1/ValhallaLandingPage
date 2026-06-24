// Bronze pipe network — page-spanning SVG.
//   • Horizontal manifold across the gauge hub.
//   • Risers run straight up behind each gauge (no visible joint hardware).
//   • Two vertical drop pipes meet the manifold at sharp 45°-mitered corners
//     and run to the page bottom.
// All coordinates are in document space so the SVG can be sized to the full page.

const NS = "http://www.w3.org/2000/svg";

const MAIN_RADIUS = 46;
const MANIFOLD_BELOW_ANCHOR = MAIN_RADIUS + 52;
const SINGLE_ROW_TOP_TOLERANCE = 8;
const SINGLE_ROW_MIN_PADDING_TOP = 48;
const RISER_RADIUS = 30;
const GAUGE_PAD = 18;
const PIPE_END_MARGIN = 24;
const CORNER_EDGE_MARGIN = 24; // px gap between the corner and the cog column
// How far the riser sinks into the main pipe so the joint reads as welded
// rather than glued-on. Up to the centerline minus a hair so the saddle
// gradient blends into the top of the main pipe.
const RISER_MAIN_OVERLAP = 10;

// Steam valves: red handwheels on the vertical drop pipes.
const VALVE_WHEEL_RATIO = 1.5; // wheel radius relative to main pipe radius
const VALVE_VENT_RATIO = 0.32; // vent-stub radius relative to main pipe radius
// Two valves per drop. The top valve sits a fixed distance below the manifold
// bar (so it's visible with little scrolling); the bottom valve is a fraction
// of the drop length. Left and right use different values so the four valves
// are staggered rather than mirror-symmetric.
const VALVE_TOP_OFFSET_LEFT = 130;   // px below the manifold corner
const VALVE_TOP_OFFSET_RIGHT = 250;
const VALVE_BOTTOM_FRAC_LEFT = 0.55; // fraction of the drop span
const VALVE_BOTTOM_FRAC_RIGHT = 0.68;

let resizeObserver = null;
let windowResizeBound = false;
let gradCounter = 0;

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === "textContent") node.textContent = v;
    else node.setAttribute(k, String(v));
  }
  return node;
}

function clearNetwork(svgEl) {
  [...svgEl.querySelectorAll(":scope > g.network-layer")].forEach((n) => n.remove());
  const defs = svgEl.querySelector("defs");
  if (defs) defs.innerHTML = "";
  gradCounter = 0;
}

/* ---------- Defs (gradients + filters) -------------------------------- */

function ensureDefs(defs) {
  const collarGrad = el("linearGradient", {
    id: "gp-bronze-collar",
    x1: "0%", y1: "0%",
    x2: "0%", y2: "100%",
  });
  [
    ["0%", "#3a2010"],
    ["18%", "#8a5a30"],
    ["48%", "#f0c878"],
    ["62%", "#c98148"],
    ["100%", "#1a0c06"],
  ].forEach(([offset, color]) => {
    collarGrad.appendChild(el("stop", { offset, "stop-color": color }));
  });
  defs.appendChild(collarGrad);

  const shadowFilter = el("filter", {
    id: "gp-pipe-shadow",
    x: "-20%", y: "-20%",
    width: "140%", height: "140%",
  });
  shadowFilter.innerHTML = `
    <feDropShadow dx="3" dy="6" stdDeviation="5" flood-color="#000000" flood-opacity="0.55"/>
  `;
  defs.appendChild(shadowFilter);

  // Glossy red enamel for the valve handwheels. objectBoundingBox units so a
  // single gradient def serves every wheel regardless of its position.
  const valveRed = el("radialGradient", { id: "gp-valve-red", cx: "36%", cy: "30%", r: "78%" });
  [
    ["0%", "#ff8a78"],
    ["32%", "#ef3b2a"],
    ["68%", "#bc1d12"],
    ["100%", "#5e0c06"],
  ].forEach(([offset, color]) => {
    valveRed.appendChild(el("stop", { offset, "stop-color": color }));
  });
  defs.appendChild(valveRed);

  // Chromed/steel center hub nut.
  const valveHub = el("radialGradient", { id: "gp-valve-hub", cx: "35%", cy: "28%", r: "80%" });
  [
    ["0%", "#ffffff"],
    ["30%", "#dadada"],
    ["64%", "#8c8c8c"],
    ["100%", "#343434"],
  ].forEach(([offset, color]) => {
    valveHub.appendChild(el("stop", { offset, "stop-color": color }));
  });
  defs.appendChild(valveHub);
}

/* ---------- Geometry helpers ------------------------------------------ */

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function dirUnit(a, b) {
  const d = dist(a, b);
  if (d < 1e-6) return { x: 0, y: -1 };
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}

function perp(u) {
  return { x: -u.y, y: u.x };
}

/* ---------- Cylinder rendering ---------------------------------------- */

// Linear gradient perpendicular to the pipe axis, in user-space coords.
// The bright specular band sits just off-center, giving the pipe its
// rounded "metal cylinder" read.
function addCylinderGradient(defs, p0, p1, radius) {
  const id = `gp-cyl-${++gradCounter}`;
  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2;
  const n = perp(dirUnit(p0, p1));
  const grad = el("linearGradient", {
    id,
    gradientUnits: "userSpaceOnUse",
    x1: mx + n.x * radius,
    y1: my + n.y * radius,
    x2: mx - n.x * radius,
    y2: my - n.y * radius,
  });
  [
    ["0%",   "#140804"],
    ["10%",  "#3a1f0e"],
    ["24%",  "#6e3f1e"],
    ["38%",  "#a86a32"],
    ["46%",  "#e8b06a"],
    ["50%",  "#ffe8b4"],
    ["55%",  "#f2bd76"],
    ["64%",  "#b8743a"],
    ["78%",  "#6a3e1c"],
    ["90%",  "#2e1608"],
    ["100%", "#0c0402"],
  ].forEach(([offset, color]) => {
    grad.appendChild(el("stop", { offset, "stop-color": color }));
  });
  defs.appendChild(grad);
  return id;
}

// Stroke a straight pipe segment with the cylindrical gradient.
// Dark outer rim + main cylinder fill + subtle off-axis highlight wash.
function strokeSegment(parent, defs, p0, p1, radius) {
  if (dist(p0, p1) < 0.5) return;
  const gradId = addCylinderGradient(defs, p0, p1, radius);
  const dia = radius * 2;
  const d = `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;

  parent.appendChild(el("path", {
    d,
    fill: "none",
    stroke: "#1a0c06",
    "stroke-width": dia + 2,
    "stroke-linecap": "butt",
    "stroke-linejoin": "round",
  }));
  parent.appendChild(el("path", {
    d,
    fill: "none",
    stroke: `url(#${gradId})`,
    "stroke-width": dia,
    "stroke-linecap": "butt",
    "stroke-linejoin": "round",
  }));
}

// Straight pipe between two arbitrary points.
function appendStraightPipe(parent, defs, p0, p1, radius) {
  strokeSegment(parent, defs, p0, p1, radius);
}

// Polygonal clipPath; used to cut pipe ends at 45° for mitered corners.
function addClipPath(defs, points) {
  const id = `gp-clip-${++gradCounter}`;
  const clip = el("clipPath", { id });
  clip.appendChild(el("polygon", {
    points: points.map((p) => `${p.x},${p.y}`).join(" "),
  }));
  defs.appendChild(clip);
  return id;
}

/* ---------- Base anchor flanges (vertical drop feet only) ------------- */

// Wider "base" flange used where the vertical drops anchor at the page bottom.
function appendAnchorFlange(parent, cx, cy, pipeR) {
  const g = el("g", { class: "gp-anchor-flange" });
  const w = pipeR * 3.6;
  const h = pipeR * 1.05;

  g.appendChild(el("ellipse", {
    cx, cy: cy + h * 0.2,
    rx: w * 0.55,
    ry: h * 0.6,
    fill: "#000000",
    opacity: "0.45",
  }));

  g.appendChild(el("rect", {
    x: cx - w / 2,
    y: cy - h / 2,
    width: w,
    height: h,
    rx: h * 0.22,
    ry: h * 0.22,
    fill: "url(#gp-bronze-collar)",
    stroke: "#1a0c06",
    "stroke-width": "2.5",
  }));

  const boltCount = 10;
  for (let i = 0; i < boltCount; i++) {
    const a = (i / boltCount) * Math.PI * 2;
    g.appendChild(el("circle", {
      cx: cx + Math.cos(a) * w * 0.38,
      cy: cy + Math.sin(a) * h * 0.32,
      r: 2.6,
      fill: "#120906",
      stroke: "#5a3a1e",
      "stroke-width": "0.7",
    }));
  }

  parent.appendChild(g);
}

/* ---------- Steam valves (handwheels + side vents) -------------------- */

// Red handwheel as its own rotatable <g> (GSAP spins it via svgOrigin cx/cy).
// Ring + four diagonal spokes (X) + chromed hub nut, matching the reference.
function buildValveWheel(cx, cy, wheelR, idx) {
  const g = el("g", {
    class: "valve-wheel",
    "data-valve-idx": idx,
    "data-cx": cx,
    "data-cy": cy,
  });
  const ringW = wheelR * 0.26;
  const spokeW = wheelR * 0.16;
  const spokeAngles = [0, 1, 2, 3].map((i) => i * (Math.PI / 2) + Math.PI / 4);

  // Dark base (rim + spokes) for depth, drawn slightly fatter underneath.
  spokeAngles.forEach((a) => {
    g.appendChild(el("line", {
      x1: cx, y1: cy,
      x2: cx + Math.cos(a) * wheelR,
      y2: cy + Math.sin(a) * wheelR,
      stroke: "#360704",
      "stroke-width": spokeW + 4,
      "stroke-linecap": "round",
    }));
  });
  g.appendChild(el("circle", {
    cx, cy, r: wheelR,
    fill: "none",
    stroke: "#360704",
    "stroke-width": ringW + 4,
  }));

  // Enamelled red spokes + rim.
  spokeAngles.forEach((a) => {
    g.appendChild(el("line", {
      x1: cx, y1: cy,
      x2: cx + Math.cos(a) * wheelR,
      y2: cy + Math.sin(a) * wheelR,
      stroke: "url(#gp-valve-red)",
      "stroke-width": spokeW,
      "stroke-linecap": "round",
    }));
  });
  g.appendChild(el("circle", {
    cx, cy, r: wheelR,
    fill: "none",
    stroke: "url(#gp-valve-red)",
    "stroke-width": ringW,
  }));
  // Soft top highlight on the rim torus.
  g.appendChild(el("circle", {
    cx, cy, r: wheelR - ringW * 0.18,
    fill: "none",
    stroke: "#ff9c8c",
    "stroke-width": ringW * 0.26,
    opacity: 0.45,
  }));

  // Chromed center hub + hex nut.
  g.appendChild(el("circle", {
    cx, cy, r: wheelR * 0.3,
    fill: "url(#gp-valve-hub)",
    stroke: "#262626",
    "stroke-width": 2,
  }));
  const nutR = wheelR * 0.18;
  const nutPts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    nutPts.push(`${cx + Math.cos(a) * nutR},${cy + Math.sin(a) * nutR}`);
  }
  g.appendChild(el("polygon", {
    points: nutPts.join(" "),
    fill: "url(#gp-valve-hub)",
    stroke: "#1c1c1c",
    "stroke-width": 1.5,
  }));
  g.appendChild(el("circle", { cx, cy, r: wheelR * 0.06, fill: "#2a2a2a" }));

  return g;
}

// Full valve: side vent flange (behind), brass bonnet on the pipe, red wheel
// on top, and an invisible steam-origin marker at the vent mouth.
// dirSign: +1 = vent to the right of the pipe, -1 = to the left.
function appendValve(parent, defs, cx, cy, pipeR, dirSign, idx) {
  const wheelR = pipeR * VALVE_WHEEL_RATIO;
  const ventR = pipeR * VALVE_VENT_RATIO;
  const g = el("g", { class: "valve", "data-valve-idx": idx });

  // Vent flange — a short brass stub poking out the side, mouth just past the
  // wheel rim so steam reads as escaping from behind the wheel.
  const mouthX = cx + dirSign * (wheelR + ventR * 0.5);
  strokeSegment(
    g, defs,
    { x: cx + dirSign * pipeR * 0.4, y: cy },
    { x: mouthX, y: cy },
    ventR,
  );
  g.appendChild(el("ellipse", {
    cx: mouthX, cy,
    rx: ventR * 0.5, ry: ventR * 1.35,
    fill: "url(#gp-bronze-collar)",
    stroke: "#1a0c06",
    "stroke-width": 2,
  }));
  g.appendChild(el("ellipse", {
    cx: mouthX + dirSign * ventR * 0.16, cy,
    rx: ventR * 0.26, ry: ventR * 1.0,
    fill: "#0a0503",
  }));

  // Brass bonnet/valve body disc on the pipe, behind the wheel.
  g.appendChild(el("circle", {
    cx, cy, r: pipeR * 1.08,
    fill: "url(#gp-bronze-collar)",
    stroke: "#1a0c06",
    "stroke-width": 2.5,
  }));
  const boltCount = 10;
  for (let i = 0; i < boltCount; i++) {
    const a = (i / boltCount) * Math.PI * 2;
    g.appendChild(el("circle", {
      cx: cx + Math.cos(a) * pipeR * 0.9,
      cy: cy + Math.sin(a) * pipeR * 0.9,
      r: 2.4,
      fill: "#120906",
      stroke: "#5a3a1e",
      "stroke-width": "0.7",
    }));
  }

  // Red handwheel.
  g.appendChild(buildValveWheel(cx, cy, wheelR, idx));

  // Invisible steam-origin marker at the vent mouth. data-steam-dir carries the
  // screen-space horizontal sign the fluid engine pushes the jet along.
  g.appendChild(el("circle", {
    class: "valve-vent",
    "data-steam-dir": dirSign,
    "data-valve-idx": idx,
    cx: mouthX + dirSign * ventR * 0.4,
    cy,
    r: 1,
    fill: "none",
    "pointer-events": "none",
  }));

  parent.appendChild(g);
}

/* ---------- Measurement (gauge anchors → document coordinates) -------- */

// Document-space offset of the SVG layer. Anchors and the manifold are
// computed in this same coordinate space so the network lines up with the
// gauges regardless of scroll position.
function getSvgOriginDoc(svgEl) {
  const r = svgEl.getBoundingClientRect();
  return { x: r.left + window.scrollX, y: r.top + window.scrollY };
}

function measureGaugeAnchors(hubEl, origin) {
  return [...hubEl.querySelectorAll(".gauge-face")].map((face) => {
    const r = face.getBoundingClientRect();
    const cx = r.left + window.scrollX + r.width / 2 - origin.x;
    const top = r.top + window.scrollY - origin.y;
    const bottom = r.bottom + window.scrollY - origin.y;
    return {
      x: cx,
      // Bottom of the dial (legacy anchor for layout).
      y: bottom - 4,
      // Riser runs up behind the gauge face; stop near the vertical center
      // of the dial so the connection is hidden under the brass bezel.
      riserTopY: top + r.height * 0.42,
    };
  });
}

function measureHubBox(hubEl, origin) {
  const r = hubEl.getBoundingClientRect();
  return {
    top:    r.top    + window.scrollY - origin.y,
    bottom: r.bottom + window.scrollY - origin.y,
    left:   r.left   + window.scrollX - origin.x,
    right:  r.right  + window.scrollX - origin.x,
  };
}

function measureGaugeObstacles(hubEl, origin, skipIndex) {
  return [...hubEl.querySelectorAll(".gauge")]
    .map((card, i) => {
      if (i === skipIndex) return null;
      const r = card.getBoundingClientRect();
      return {
        left:   r.left   + window.scrollX - origin.x - GAUGE_PAD,
        top:    r.top    + window.scrollY - origin.y - GAUGE_PAD,
        right:  r.right  + window.scrollX - origin.x + GAUGE_PAD,
        bottom: r.bottom + window.scrollY - origin.y + GAUGE_PAD,
      };
    })
    .filter(Boolean);
}

function segmentHitsRect(x1, y1, x2, y2, rect) {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  if (x1 < rect.left || x1 > rect.right) return false;
  return maxY > rect.top && minY < rect.bottom;
}

function resolveRiserX(anchorX, manifoldY, anchorY, obstacles) {
  let x = anchorX;
  for (let attempt = 0; attempt < 28; attempt++) {
    const hit = obstacles.some((r) => segmentHitsRect(x, manifoldY, x, anchorY, r));
    if (!hit) return x;
    x += (attempt % 2 === 0 ? 1 : -1) * (10 + Math.floor(attempt / 2) * 5);
  }
  return anchorX;
}

function computeManifoldY(hubBox, anchors) {
  const maxAnchor = anchors.length ? Math.max(...anchors.map((a) => a.y)) : hubBox.top;
  // Main pipe sits below the gauge cluster; risers are plain pipes with no
  // flanges, so we only need enough gap for a short visible riser length.
  return maxAnchor + MANIFOLD_BELOW_ANCHOR;
}

function areGaugesSingleRow(hubEl) {
  const faces = [...hubEl.querySelectorAll(".gauge-face")];
  if (faces.length < 2) return false;
  const tops = faces.map((face) => face.getBoundingClientRect().top);
  return Math.max(...tops) - Math.min(...tops) < SINGLE_ROW_TOP_TOLERANCE;
}

function getManifoldOffsetFromGauges(gaugesEl) {
  const gaugesTop = gaugesEl.getBoundingClientRect().top;
  const maxAnchor = Math.max(
    ...[...gaugesEl.querySelectorAll(".gauge-face")].map((face) => face.getBoundingClientRect().bottom - 4),
  );
  return maxAnchor - gaugesTop + MANIFOLD_BELOW_ANCHOR;
}

function applyHubLayout(hubEl) {
  hubEl.classList.remove("gauges-hub--single-row");
  hubEl.style.removeProperty("--single-row-padding-top");

  if (!areGaugesSingleRow(hubEl)) return;

  const gaugesEl = hubEl.querySelector(".gauges");
  if (!gaugesEl) return;

  const offset = getManifoldOffsetFromGauges(gaugesEl);
  const paddingTop = Math.max(SINGLE_ROW_MIN_PADDING_TOP, window.innerHeight / 2 - offset);
  hubEl.style.setProperty("--single-row-padding-top", `${paddingTop}px`);
  hubEl.classList.add("gauges-hub--single-row");
}

/* ---------- Top-level build ------------------------------------------- */

function buildLayers(hubEl, hubBox, anchors, defs, docHeight, docWidth) {
  const pipes    = el("g", { class: "network-layer gp-pipes",    filter: "url(#gp-pipe-shadow)" });
  const fittings = el("g", { class: "network-layer gp-fittings" });
  const valves   = el("g", { class: "network-layer gp-valves",   filter: "url(#gp-pipe-shadow)" });

  const origin = getSvgOriginDoc(document.getElementById("gauge-pipe-network"));

  const manifoldY = computeManifoldY(hubBox, anchors);
  const xs = anchors.map((a) => a.x);
  const minAnchorX = Math.min(...xs);
  const maxAnchorX = Math.max(...xs);

  // Push the vertical drops out toward the page edges, just inside the
  // cog columns, instead of clamping inside the gauges-hub padding. This
  // gives the 90° corners plenty of room and lengthens the horizontal
  // main to match.
  const cogColWidthRaw = getComputedStyle(document.body)
    .getPropertyValue("--cog-column-width")
    .trim();
  const cogColWidth = parseFloat(cogColWidthRaw) || 220;
  const edgeInset = cogColWidth + CORNER_EDGE_MARGIN + MAIN_RADIUS;
  const minX = Math.min(minAnchorX - MAIN_RADIUS * 2, edgeInset);
  const maxX = Math.max(maxAnchorX + MAIN_RADIUS * 2, docWidth - edgeInset);

  const leftCorner  = { x: minX, y: manifoldY };
  const rightCorner = { x: maxX, y: manifoldY };

  const R = MAIN_RADIUS;
  const dropEndY = docHeight - PIPE_END_MARGIN;

  // Horizontal main: trapezoid clip cuts both ends at 45° so the drops can
  // butt up flush. Centerline extends R past each corner so the stroke
  // rectangle fully contains the mitered polygon before clipping.
  const mainClip = addClipPath(defs, [
    { x: leftCorner.x  - R, y: manifoldY - R },
    { x: rightCorner.x + R, y: manifoldY - R },
    { x: rightCorner.x - R, y: manifoldY + R },
    { x: leftCorner.x  + R, y: manifoldY + R },
  ]);
  const mainG = el("g", { "clip-path": `url(#${mainClip})` });
  strokeSegment(
    mainG, defs,
    { x: leftCorner.x  - R, y: manifoldY },
    { x: rightCorner.x + R, y: manifoldY },
    R,
  );
  pipes.appendChild(mainG);

  // Risers: plain pipe from the top of the main manifold up behind each
  // gauge (no flanges — the dial hides where the pipe meets the fitting).
  const mainTopY = manifoldY - R;
  anchors.forEach((anchor, idx) => {
    const obstacles = measureGaugeObstacles(hubEl, origin, idx);
    const riserX = resolveRiserX(anchor.x, mainTopY, anchor.riserTopY, obstacles);
    const riserTop    = { x: riserX, y: anchor.riserTopY };
    const riserBottom = { x: riserX, y: mainTopY + RISER_MAIN_OVERLAP };

    if (Math.abs(riserX - anchor.x) > 8) {
      const kneeY = anchor.riserTopY + 36;
      const knee  = { x: riserX, y: kneeY };
      const horiz = { x: anchor.x, y: kneeY };
      appendStraightPipe(pipes, defs, riserBottom, knee, RISER_RADIUS);
      appendStraightPipe(pipes, defs, knee, horiz, RISER_RADIUS);
      appendStraightPipe(pipes, defs, horiz, { x: anchor.x, y: anchor.riserTopY }, RISER_RADIUS);
    } else {
      appendStraightPipe(pipes, defs, riserBottom, riserTop, RISER_RADIUS);
    }
  });

  // Left drop: 45° miter at top against the horizontal main.
  const leftDropClip = addClipPath(defs, [
    { x: leftCorner.x - R, y: leftCorner.y - R },
    { x: leftCorner.x + R, y: leftCorner.y + R },
    { x: leftCorner.x + R, y: dropEndY },
    { x: leftCorner.x - R, y: dropEndY },
  ]);
  const leftDropG = el("g", { "clip-path": `url(#${leftDropClip})` });
  strokeSegment(
    leftDropG, defs,
    { x: leftCorner.x, y: leftCorner.y - R },
    { x: leftCorner.x, y: dropEndY },
    R,
  );
  pipes.appendChild(leftDropG);
  appendAnchorFlange(fittings, leftCorner.x, dropEndY, R);

  // Right drop: mirrored miter.
  const rightDropClip = addClipPath(defs, [
    { x: rightCorner.x - R, y: rightCorner.y + R },
    { x: rightCorner.x + R, y: rightCorner.y - R },
    { x: rightCorner.x + R, y: dropEndY },
    { x: rightCorner.x - R, y: dropEndY },
  ]);
  const rightDropG = el("g", { "clip-path": `url(#${rightDropClip})` });
  strokeSegment(
    rightDropG, defs,
    { x: rightCorner.x, y: rightCorner.y - R },
    { x: rightCorner.x, y: dropEndY },
    R,
  );
  pipes.appendChild(rightDropG);
  appendAnchorFlange(fittings, rightCorner.x, dropEndY, R);

  // Steam valves: two per vertical drop, staggered between sides. Alternate the
  // vent direction so the jets are mixed (inward toward center / outward toward
  // the edges). Left drop: inward is +1 (toward page center); right drop: -1.
  const dropSpan = dropEndY - manifoldY;
  const leftValveYs = [manifoldY + VALVE_TOP_OFFSET_LEFT, manifoldY + dropSpan * VALVE_BOTTOM_FRAC_LEFT];
  const rightValveYs = [manifoldY + VALVE_TOP_OFFSET_RIGHT, manifoldY + dropSpan * VALVE_BOTTOM_FRAC_RIGHT];
  leftValveYs.forEach((vy, i) => {
    appendValve(valves, defs, leftCorner.x, vy, R, i === 0 ? 1 : -1, i);
  });
  rightValveYs.forEach((vy, i) => {
    appendValve(valves, defs, rightCorner.x, vy, R, i === 0 ? -1 : 1, 2 + i);
  });

  return [pipes, fittings, valves];
}

function syncSvgSizeToDoc(svgEl) {
  const w = document.documentElement.clientWidth;
  const h = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    window.innerHeight,
  );
  svgEl.setAttribute("width", String(w));
  svgEl.setAttribute("height", String(h));
  svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
  // Inline styles force the SVG to render at its full document size
  // regardless of how percentage heights resolve on its ancestors —
  // this is what prevents the viewBox from being squashed to one viewport.
  svgEl.style.width = `${w}px`;
  svgEl.style.height = `${h}px`;
  // Pull the parent .pipe-layer up to the same size so its overflow:visible
  // doesn't ever clip the drop pipes if a future style adds clipping.
  const parent = svgEl.parentElement;
  if (parent && parent.classList.contains("pipe-layer")) {
    parent.style.width = `${w}px`;
    parent.style.height = `${h}px`;
  }
  return { w, h };
}

export function buildGaugePipeNetwork({ hubEl, svgEl }) {
  if (!hubEl || !svgEl) return;

  applyHubLayout(hubEl);

  clearNetwork(svgEl);
  const { w: docWidth, h: docHeight } = syncSvgSizeToDoc(svgEl);

  let defs = svgEl.querySelector("defs");
  if (!defs) {
    defs = el("defs");
    svgEl.prepend(defs);
  }
  ensureDefs(defs);

  const origin = getSvgOriginDoc(svgEl);
  const anchors = measureGaugeAnchors(hubEl, origin);
  if (anchors.length === 0) return;

  const hubBox = measureHubBox(hubEl, origin);

  buildLayers(hubEl, hubBox, anchors, defs, docHeight, docWidth).forEach((layer) =>
    svgEl.appendChild(layer),
  );
}

export function attachGaugePipeNetwork({ hubEl, svgEl }) {
  if (!hubEl || !svgEl) return () => {};

  const rebuild = () => {
    requestAnimationFrame(() => buildGaugePipeNetwork({ hubEl, svgEl }));
  };

  rebuild();
  // Re-run once more after layout has fully settled (font load, gauge SVGs).
  requestAnimationFrame(rebuild);

  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver(rebuild);
  resizeObserver.observe(hubEl);
  resizeObserver.observe(document.body);

  if (!windowResizeBound) {
    window.addEventListener("resize", rebuild);
    windowResizeBound = true;
  }

  return () => {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  };
}
