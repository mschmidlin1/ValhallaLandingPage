// Valhalla shared link data - single source of truth for the landing page.
// Update a URL here once and the page picks it up.
//
// `status` controls the small "PENDING" badge styling (see theme.css).
// When a real URL is ready, change `url` and set `status: "live"`.

export const VALHALLA_LINKS = [
  {
    id: "portfolio",
    title: "Portfolio",
    subtitle: "michaelschmidlin.com",
    description: "Personal website and project showcase",
    url: "https://michaelschmidlin.com",
    status: "live",
    glyph: "P",
  },
  {
    id: "trendline",
    title: "Trendline",
    subtitle: "Market Dashboard",
    description: "Real-time market trend analysis",
    url: "#",
    status: "coming-soon",
    glyph: "T",
  },
  {
    id: "resume",
    title: "Resume Customizer",
    subtitle: "Tailored Applications",
    description: "AI-assisted resume tuning",
    url: "#",
    status: "coming-soon",
    glyph: "R",
  },
  {
    id: "budget",
    title: "Budget Analysis",
    subtitle: "Financial Insights",
    description: "Personal finance dashboard",
    url: "#",
    status: "coming-soon",
    glyph: "B",
  },
];

// Convenience for non-module includes.
if (typeof window !== "undefined") {
  window.VALHALLA_LINKS = VALHALLA_LINKS;
}
