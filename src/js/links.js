// Valhalla shared link data - single source of truth for the landing page.
// Update a URL here once and the page picks it up.
//
// `status` is `"live"` for external links or `"coming-soon"` for placeholders
// (coming-soon gauges look the same but do not navigate).
// Placeholder URLs (`#` or empty) show the coming-soon banner on click.

export function hasNavigableUrl(link) {
  const url = (link?.url ?? "").trim();
  return url.length > 0 && url !== "#" && !url.startsWith("#");
}

export const VALHALLA_LINKS = [
  {
    id: "portfolio",
    title: "Portfolio",
    subtitle: "michaelschmidlin.com",
    description: "Personal website and project showcase",
    url: "https://michaelschmidlin.com",
    status: "live",
  },
  {
    id: "trendline",
    title: "Trendline",
    subtitle: "Market Dashboard",
    description: "Real-time market trend analysis",
    url: "#", // resolved at runtime from mschmidlin1/TrendLine README (see trendline-link.js)
    status: "coming-soon",
  },
  {
    id: "resume",
    title: "Resume Customizer",
    subtitle: "Tailored Applications",
    description: "AI-assisted resume tuning",
    url: "#",
    status: "coming-soon",
  },
  {
    id: "budget",
    title: "Budget Analysis",
    subtitle: "Financial Insights",
    description: "Personal finance dashboard",
    url: "#",
    status: "coming-soon",
  },
];

// Convenience for non-module includes.
if (typeof window !== "undefined") {
  window.VALHALLA_LINKS = VALHALLA_LINKS;
}
