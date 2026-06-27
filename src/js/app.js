import { VALHALLA_LINKS, hasNavigableUrl } from "./links.js";
import { getIconSvg } from "./icons.js";
import { fetchTrendlineUrl } from "./trendline-link.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

function activateLinkCard(cardEl, url) {
  cardEl.href = url;
  cardEl.target = "_blank";
  cardEl.rel = "noopener noreferrer";
  cardEl.dataset.status = "live";
  cardEl.classList.remove("link-card--coming-soon");
  cardEl.removeEventListener("click", onComingSoonClick);
}

const linkGrid = document.getElementById("link-grid");
if (!linkGrid) throw new Error("link-grid element not found");

VALHALLA_LINKS.forEach((link) => {
  const a = document.createElement("a");
  a.className = "link-card";
  a.dataset.status = link.status;
  a.dataset.linkId = link.id;

  if (!hasNavigableUrl(link)) {
    a.classList.add("link-card--coming-soon");
  }

  if (hasNavigableUrl(link)) {
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  } else {
    a.href = "#";
    a.addEventListener("click", onComingSoonClick);
  }

  a.innerHTML = `
    <span class="link-card__icon" aria-hidden="true">${getIconSvg(link.icon)}</span>
    <p class="link-card__title">${link.title}</p>
    <p class="link-card__subtitle">${link.subtitle}</p>
  `;

  linkGrid.appendChild(a);
});

fetchTrendlineUrl().then((url) => {
  if (!url) return;
  const card = linkGrid.querySelector('[data-link-id="trendline"]');
  if (card) activateLinkCard(card, url);
});
