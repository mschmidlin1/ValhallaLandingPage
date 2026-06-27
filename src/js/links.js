// Valhalla shared link data - single source of truth for the landing page.
// Update a URL here once and the page picks it up.
//
// `status` is `"live"` for external links or `"coming-soon"` for placeholders
// (coming-soon cards look the same but do not navigate).
// Placeholder URLs (`#` or empty) show the coming-soon banner on click.

export function hasNavigableUrl(link) {
  const url = (link?.url ?? "").trim();
  return url.length > 0 && url !== "#" && !url.startsWith("#");
}

export const VALHALLA_LINKS = [
  {
    id: "portfolio",
    icon: "user",
    title: "Michael's Portfolio",
    subtitle: "michaelschmidlin.com",
    description: "Professional Portfolio",
    url: "https://michaelschmidlin.com",
    status: "live",
  },
  {
    id: "trendline",
    icon: "chart-line",
    title: "Trendline",
    subtitle: "Market Dashboard",
    description: "Algorithmic Trading",
    url: "#", // resolved at runtime from mschmidlin1/TrendLine README (see trendline-link.js)
    status: "coming-soon",
  },
  {
    id: "resume",
    icon: "file-text",
    title: "Resume Customizer",
    subtitle: "Tailored Applications",
    description: "Tailor Resume",
    url: "#",
    status: "coming-soon",
  },
  {
    id: "budget",
    icon: "wallet",
    title: "Budget Analysis",
    subtitle: "Financial Insights",
    description: "Personal finance dashboard",
    url: "#",
    status: "coming-soon",
  },
  {
    id: "madeleine-portfolio",
    icon: "user",
    title: "Madeleine's Portfolio",
    subtitle: "Portfolio",
    description: "Professional Portfolio",
    url: "#",
    status: "coming-soon",
  },
  {
    id: "dr-jam",
    icon: "music",
    title: "Dr. JAM",
    subtitle: "Music",
    description: "A music based memorial",
    url: "#",
    status: "coming-soon",
  },
];

// Convenience for non-module includes.
if (typeof window !== "undefined") {
  window.VALHALLA_LINKS = VALHALLA_LINKS;
}
