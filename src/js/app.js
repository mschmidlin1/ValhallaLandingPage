import { VALHALLA_LINKS, hasNavigableUrl } from "./links.js?v=45";
import { getIconSvg } from "./icons.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const comingSoonBanner = document.getElementById("coming-soon-banner");
let comingSoonHideTimer = null;

function showComingSoonBanner(title) {
  if (!comingSoonBanner) return;

  const message = comingSoonBanner.querySelector(".coming-soon-banner__message");
  if (message) {
    message.textContent = `${title} is on the way. Check back soon!`;
  }

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

const HEX_PLACES = ["center", "n", "ne", "se", "s", "sw", "nw"];

const linkGrid = document.getElementById("link-grid");
if (!linkGrid) throw new Error("link-grid element not found");

VALHALLA_LINKS.forEach((link, index) => {
  const place = link.place ?? HEX_PLACES[index];
  if (!place) return;

  const isComingSoon = link.status === "coming-soon" || !hasNavigableUrl(link);
  const card = document.createElement(isComingSoon ? "button" : "a");
  card.className = "link-card";
  card.dataset.status = link.status;
  card.dataset.linkId = link.id;
  card.dataset.place = place;

  if (isComingSoon) {
    card.type = "button";
    card.classList.add("link-card--coming-soon");
    card.setAttribute("aria-label", `${link.title}. ${link.description}. Coming soon.`);
    card.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showComingSoonBanner(link.title);
    });
  } else {
    card.href = link.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
  }

  card.innerHTML = `
    <span class="link-card__face">
      <span class="link-card__icon" aria-hidden="true">${getIconSvg(link.icon)}</span>
      <span class="link-card__copy">
        <p class="link-card__title">${link.title}</p>
        <p class="link-card__subtitle">${link.description}</p>
      </span>
    </span>
  `;

  linkGrid.appendChild(card);
});
