const STORAGE_KEY = "valhalla-theme";

const METAL = "url(#valhalla-metal)";

const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${METAL}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;

const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${METAL}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;

function getSavedTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // localStorage unavailable
  }
  return null;
}

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getEffectiveTheme() {
  return getSavedTheme() ?? getSystemTheme();
}

function applySavedTheme() {
  const saved = getSavedTheme();
  if (saved) {
    document.documentElement.dataset.theme = saved;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function updateToggleButton(toggle) {
  const effective = getEffectiveTheme();
  toggle.innerHTML = effective === "dark" ? sunIcon : moonIcon;
  toggle.setAttribute("aria-label", effective === "dark" ? "Switch to light mode" : "Switch to dark mode");
  toggle.setAttribute("aria-pressed", effective === "dark" ? "true" : "false");
}

function initThemeToggle() {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  updateToggleButton(toggle);

  toggle.addEventListener("click", () => {
    const next = getEffectiveTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    document.documentElement.dataset.theme = next;
    updateToggleButton(toggle);
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!getSavedTheme()) updateToggleButton(toggle);
  });
}

applySavedTheme();
initThemeToggle();

export { getEffectiveTheme, getSavedTheme };
