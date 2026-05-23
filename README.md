# Valhalla Landing Page

A steampunk-themed landing page for Michael Schmidlin's portfolio and personal web tools — **The Engine Room** variant.

The 4 tool links on the page:

| Tool | URL | Status |
|---|---|---|
| Portfolio | https://michaelschmidlin.com | live |
| Trendline Dashboard | (pending) | coming soon |
| Resume Customizer | (pending) | coming soon |
| Budget Analysis | (pending) | coming soon |

Update [`shared/links.js`](shared/links.js) once and the page picks up the change.

---

## Run locally

```powershell
.\serve.ps1
```

Open:

- http://localhost:8001/v1-engine-room/

When you're done:

```powershell
.\serve.ps1 -Stop
```

Requires Python 3 on PATH. The launcher records the spawned PID in `.serve-pids.txt` so `-Stop` knows what to kill.

---

## The Engine Room

**Lead:** inline SVG + GSAP ScrollTrigger.

Massive interlocking brass/copper/gold gears that rotate as you scroll, full-height side cog columns pinned to the viewport, riveted brass framing, tool links as round brass pressure gauges (needle swings on hover), procedural smokestacks with billowing steam on the bottom-right, distant SVG dirigible silhouette behind the hero gears.

---

## Technology

Static HTML/CSS/JS with **no build step**. Libraries from CDNs:

| Library | Version | Purpose |
|---|---|---|
| GSAP + ScrollTrigger | 3.12.5 (cdnjs) | scroll-driven animation |
| Google Fonts | n/a | Cinzel (display), IM Fell English (body), Special Elite (typewriter) |

Gears, smokestacks, gauges, and airship silhouettes are procedurally generated SVG/CSS. **No raster assets** are loaded; files in `inspiration_photos/` are vibe reference only.

---

## File layout

```
ValhallaLandingPage/
  shared/
    theme.css     # palette + typography + shared utilities
    fonts.css     # Google Fonts @import
    links.js      # single source of truth for the 4 tool links (ES module)
  v1-engine-room/
    index.html
    styles.css
    app.js
  inspiration_photos/      # vibe reference (not loaded into pages)
  serve.ps1                # launches server on port 8001
  README.md
```

---

## Editing tips

- **Recolor everything**: edit the CSS variables at the top of [`shared/theme.css`](shared/theme.css).
- **Update a link**: edit [`shared/links.js`](shared/links.js). Set `status: "live"` and a real `url` to remove the "PENDING" badge.
- **Adjust scroll-rotation speed**: search for `scrub` in [`v1-engine-room/app.js`](v1-engine-room/app.js) (lower = snappier).
- **Tweak steam frequency**: search `scheduleSteamForStack` in [`v1-engine-room/app.js`](v1-engine-room/app.js).
