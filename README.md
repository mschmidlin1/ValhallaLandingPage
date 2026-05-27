# Valhalla Landing Page

A steampunk-themed landing page for Michael Schmidlin's portfolio and personal web tools — **The Engine Room**.

The 4 tool links on the page:

| Tool | URL | Status |
|---|---|---|
| Portfolio | https://michaelschmidlin.com | live |
| Trendline Dashboard | (pending) | coming soon |
| Resume Customizer | (pending) | coming soon |
| Budget Analysis | (pending) | coming soon |

Update [`src/js/links.js`](src/js/links.js) once and the page picks up the change.

---

## Run locally

1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) VS Code extension (recommended via workspace prompt).
2. Open [`src/index.html`](src/index.html) and click **Go Live**.

Open:

- http://localhost:5500/

Workspace settings in [`.vscode/settings.json`](.vscode/settings.json) pin the server to port **5500** with document root `src/`.

---

## The Engine Room

**Lead:** inline SVG + GSAP ScrollTrigger.

Massive interlocking brass/copper/gold gears that rotate as you scroll, full-height side cog columns pinned to the viewport, riveted brass framing, tool links as round brass pressure gauges (needle swings on hover), procedural smokestacks with WebGL fluid steam on the bottom-right, distant SVG dirigible silhouette behind the hero gears.

---

## Technology

Static HTML/CSS/JS with **no build step**. Libraries from CDNs:

| Library | Version | Purpose |
|---|---|---|
| GSAP + ScrollTrigger | 3.12.5 (cdnjs) | scroll-driven animation |
| Google Fonts | n/a | Cinzel (display), IM Fell English (body), Special Elite (typewriter) |

Gears, smokestacks, gauges, and airship silhouettes are procedurally generated SVG/CSS. Steam uses a trimmed [WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) (MIT) in `src/lib/fluid/`. **No raster assets** are loaded for the page UI; files in `inspiration_photos/` are vibe reference only.

---

## File layout

```
ValhallaLandingPage/
  src/
    index.html
    css/
      fonts.css     # Google Fonts @import
      theme.css     # palette + typography + utilities
      styles.css    # page layout and components
    js/
      app.js
      links.js      # single source of truth for the 4 tool links
      pipe-network.js
      fluid-steam.js
    lib/
      fluid/        # MIT WebGL fluid sim (steam overlay)
  inspiration_photos/   # vibe reference (not loaded into pages)
  .vscode/
    settings.json
    extensions.json
  README.md
```

---

## Editing tips

- **Recolor everything**: edit the CSS variables at the top of [`src/css/theme.css`](src/css/theme.css).
- **Update a link**: edit [`src/js/links.js`](src/js/links.js). Set `status: "live"` and a real `url` to remove the "PENDING" badge.
- **Adjust scroll-rotation speed**: search for `scrub` in [`src/js/app.js`](src/js/app.js) (lower = snappier).
- **Tweak steam frequency**: search `scheduleSteamForStack` in [`src/js/app.js`](src/js/app.js).
- **Tweak steam look**: edit dye/splat settings in [`src/js/fluid-steam.js`](src/js/fluid-steam.js).
- **Tweak steam pressure / rise speed**: adjust `STEAM_PRESSURE` (0–1) at the top of [`fluid-steam.js`](src/js/fluid-steam.js).
