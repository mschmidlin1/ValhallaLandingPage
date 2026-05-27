// Bronze pipe network — page-spanning SVG.
//   • Horizontal manifold across the gauge hub.
//   • Risers run straight up behind each gauge (no visible joint hardware).
//   • Two vertical drop pipes that elbow off the manifold and run to the page bottom.
// All coordinates are in document space so the SVG can be sized to the full page.

const NS = "http://www.w3.org/2000/svg";

const MAIN_RADIUS = 46;
const RISER_RADIUS = 30;
const GAUGE_PAD = 18;
const PIPE_END_MARGIN = 24;
const ELBOW_BEND_SCALE = 1.4; // bend radius = pipeR * this
const ELBOW_SEGMENTS = 28;    // sub-segments per 90° bend (more = less visible seams)
const ELBOW_OVERLAP = 0.08;   // fractional overlap between adjacent segments
const CORNER_EDGE_MARGIN = 24; // px gap between the corner and the cog column
// How far the riser sinks into the main pipe so the joint reads as welded
// rather than glued-on. Up to the centerline minus a hair so the saddle
// gradient blends into the top of the main pipe.
const RISER_MAIN_OVERLAP = 10;

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

/* ---------- 90° elbow (tessellated arc with smoothing overlays) -------- */

// Walk the quarter-arc as many short straight segments. Each segment uses
// the same cylindrical gradient as straight pipe, so the bright specular
// band rotates smoothly with the bend (matches the rest of the network).
//
// The "strip" look from the early version is suppressed three ways:
//   1. ELBOW_SEGMENTS is large enough that the angular step is small (~3°).
//   2. stroke-linecap: round + segment-to-segment overlap hides the seams.
//   3. A single continuous outline arc and highlight arc are drawn under
//      and over the segments, giving a perfectly smooth outer silhouette.
function appendElbow(parent, defs, corner, dirIn, dirOut, pipeR, bendR) {
  const tangentIn  = { x: corner.x - dirIn.x  * bendR, y: corner.y - dirIn.y  * bendR };
  const tangentOut = { x: corner.x + dirOut.x * bendR, y: corner.y + dirOut.y * bendR };
  const cross = dirIn.x * dirOut.y - dirIn.y * dirOut.x;
  const inward = { x: -dirIn.y * Math.sign(cross), y: dirIn.x * Math.sign(cross) };
  const center = { x: tangentIn.x + inward.x * bendR, y: tangentIn.y + inward.y * bendR };

  const a0 = Math.atan2(tangentIn.y  - center.y, tangentIn.x  - center.x);
  const a1 = Math.atan2(tangentOut.y - center.y, tangentOut.x - center.x);
  let delta = a1 - a0;
  while (delta >  Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const dia = pipeR * 2;
  const sweep = cross > 0 ? 1 : 0;
  const arcD = `M ${tangentIn.x} ${tangentIn.y} A ${bendR} ${bendR} 0 0 ${sweep} ${tangentOut.x} ${tangentOut.y}`;

  // 1. Single continuous dark outline arc — smooth outer silhouette.
  parent.appendChild(el("path", {
    d: arcD,
    fill: "none",
    stroke: "#1a0c06",
    "stroke-width": dia + 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  }));

  // 2. Tessellated cylinder gradient — each short segment carries the bronze
  //    cross-section, slightly overlapping the next to hide the joins.
  const arcPt = (a) => ({ x: center.x + Math.cos(a) * bendR, y: center.y + Math.sin(a) * bendR });
  const step = delta / ELBOW_SEGMENTS;
  const overlap = step * ELBOW_OVERLAP;
  for (let i = 0; i < ELBOW_SEGMENTS; i++) {
    const sa = a0 + step * i - overlap;
    const ea = a0 + step * (i + 1) + overlap;
    const p0 = arcPt(sa);
    const p1 = arcPt(ea);
    const gradId = addCylinderGradient(defs, p0, p1, pipeR);
    parent.appendChild(el("path", {
      d: `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`,
      fill: "none",
      stroke: `url(#${gradId})`,
      "stroke-width": dia,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }));
  }

  // 3. Single continuous specular highlight arc on the convex outer face
  //    so the bronze sheen reads as one uniform curve, not stacked strips.
  const hlR = bendR + pipeR * 0.38 * (cross > 0 ? -1 : 1);
  const innerR = Math.abs(hlR);
  const hl0 = { x: center.x + Math.cos(a0) * innerR, y: center.y + Math.sin(a0) * innerR };
  const hl1 = { x: center.x + Math.cos(a1) * innerR, y: center.y + Math.sin(a1) * innerR };
  parent.appendChild(el("path", {
    d: `M ${hl0.x} ${hl0.y} A ${innerR} ${innerR} 0 0 ${sweep} ${hl1.x} ${hl1.y}`,
    fill: "none",
    stroke: "rgba(255, 235, 200, 0.42)",
    "stroke-width": Math.max(2.5, pipeR * 0.16),
    "stroke-linecap": "round",
  }));

  return { tangentIn, tangentOut };
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
  return maxAnchor + MAIN_RADIUS + 52;
}

/* ---------- Top-level build ------------------------------------------- */

function buildLayers(hubEl, hubBox, anchors, defs, docHeight, docWidth) {
  const pipes    = el("g", { class: "network-layer gp-pipes",    filter: "url(#gp-pipe-shadow)" });
  const fittings = el("g", { class: "network-layer gp-fittings" });

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
  const bendR = MAIN_RADIUS * ELBOW_BEND_SCALE;

  // Horizontal main runs between the elbow tangent points (not all the way
  // into the curve, so the bend reads as a single swept fitting).
  const mainLeftEnd  = { x: leftCorner.x  + bendR, y: manifoldY };
  const mainRightEnd = { x: rightCorner.x - bendR, y: manifoldY };
  appendStraightPipe(pipes, defs, mainLeftEnd, mainRightEnd, MAIN_RADIUS);

  // Risers: plain pipe from the top of the main manifold up behind each
  // gauge (no flanges — the dial hides where the pipe meets the fitting).
  const mainTopY = manifoldY - MAIN_RADIUS;
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

  // 90° elbows + vertical drops down to the bottom of the page.
  const dropEndY = docHeight - PIPE_END_MARGIN;

  appendElbow(pipes, defs, leftCorner, { x: -1, y: 0 }, { x: 0, y: 1 }, MAIN_RADIUS, bendR);
  appendStraightPipe(
    pipes, defs,
    { x: leftCorner.x, y: leftCorner.y + bendR },
    { x: leftCorner.x, y: dropEndY },
    MAIN_RADIUS,
  );
  appendAnchorFlange(fittings, leftCorner.x, dropEndY, MAIN_RADIUS);

  appendElbow(pipes, defs, rightCorner, { x: 1, y: 0 }, { x: 0, y: 1 }, MAIN_RADIUS, bendR);
  appendStraightPipe(
    pipes, defs,
    { x: rightCorner.x, y: rightCorner.y + bendR },
    { x: rightCorner.x, y: dropEndY },
    MAIN_RADIUS,
  );
  appendAnchorFlange(fittings, rightCorner.x, dropEndY, MAIN_RADIUS);

  return [pipes, fittings];
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
