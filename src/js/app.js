import { VALHALLA_LINKS, hasNavigableUrl } from "./links.js";
import { getIconSvg } from "./icons.js";

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
  e.stopPropagation();
  showComingSoonBanner();
}

const linkGrid = document.getElementById("link-grid");
if (!linkGrid) throw new Error("link-grid element not found");

VALHALLA_LINKS.forEach((link) => {
  const isComingSoon = link.status === "coming-soon" || !hasNavigableUrl(link);
  const card = document.createElement(isComingSoon ? "button" : "a");
  card.className = "link-card";
  card.dataset.status = link.status;
  card.dataset.linkId = link.id;

  if (isComingSoon) {
    card.type = "button";
    card.classList.add("link-card--coming-soon");
    card.addEventListener("click", onComingSoonClick);
  } else {
    card.href = link.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
  }

  card.innerHTML = `
    <span class="link-card__icon" aria-hidden="true">${getIconSvg(link.icon)}</span>
    <p class="link-card__title">${link.title}</p>
    <p class="link-card__subtitle">${link.description}</p>
  `;

  linkGrid.appendChild(card);
});
