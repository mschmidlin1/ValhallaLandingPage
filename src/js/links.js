// Valhalla shared link data - single source of truth for the landing page.
// Update a URL here once and the page picks it up.
//
// `status` is `"live"` for external links or `"coming-soon"` for placeholders
// (coming-soon cards look the same but do not navigate).
// Placeholder URLs (`#` or empty) show the coming-soon banner on click.
//
// `place` sets the hex tile in the cluster: `center`, then `n`, `ne`, `se`,
// `s`, `sw`, `nw` clockwise from the top.

export function hasNavigableUrl(link) {
  const url = (link?.url ?? "").trim();
  return url.length > 0 && url !== "#" && !url.startsWith("#");
}

export const VALHALLA_LINKS = [
  {
    id: "portfolio",
    icon: "user",
    title: "Michael's Portfolio",
    subtitle: "michael.schmidlin.casa",
    description: "Professional Portfolio",
    url: "https://michael.schmidlin.casa",
    status: "live",
    place: "center",
  },
  {
    id: "trendline",
    icon: "chart-line",
    title: "Trendline",
    subtitle: "trendline.schmidlin.casa",
    description: "Algorithmic Trading",
    url: "https://trendline.schmidlin.casa",
    status: "live",
    place: "n",
  },
  {
    id: "resume",
    icon: "file-text",
    title: "Resume Customizer",
    subtitle: "customizer.schmidlin.casa",
    description: "Tailor Resume",
    url: "https://customizer.schmidlin.casa",
    status: "live",
    place: "ne",
  },
  {
    id: "budget",
    icon: "wallet",
    title: "Budget Analysis",
    subtitle: "budget-analysis.schmidlin.casa",
    description: "Personal Finance",
    url: "https://budget-analysis.schmidlin.casa",
    status: "live",
    place: "se",
  },
  {
    id: "madeleine-portfolio",
    icon: "user",
    title: "Madeleine's Portfolio",
    subtitle: "Portfolio",
    description: "Professional Portfolio",
    url: "https://madeleine.schmidlin.casa",
    status: "live",
    place: "s",
  },
  {
    id: "dr-jam",
    icon: "music",
    title: "Dr. JAM",
    subtitle: "dr-jam.schmidlin.casa",
    description: "Musical Memorial",
    url: "https://dr-jam.schmidlin.casa",
    status: "live",
    place: "sw",
  },
  {
    id: "slide-quest",
    icon: "gamepad",
    title: "Slide Quest!",
    subtitle: "slide-quest.schmidlin.casa",
    description: "Retro Game",
    url: "https://slide-quest.schmidlin.casa",
    status: "live",
    place: "nw",
  },
];

// Convenience for non-module includes.
if (typeof window !== "undefined") {
  window.VALHALLA_LINKS = VALHALLA_LINKS;
}
