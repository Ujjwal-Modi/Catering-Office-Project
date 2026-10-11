/* App shell: sidebar (desktop) / slide-in drawer (mobile) + top bar. */
import { esc, $ } from "./ui.js";
import { logout, ROLES } from "./auth.js";
import { APP_NAME } from "./firebase-config.js";
import { t, forceEnglish, applyI18n, langToggleHTML, bindLangToggle } from "./i18n.js";

const ICONS = {
  dashboard: '<path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z"/>',
  projects: '<path d="M4 4h16v4H4zm0 6h16v10H4zm3 3v2h6v-2z"/>',
  vendors: '<path d="M3 7l9-4 9 4v2H3zm2 4h2v7H5zm4 0h2v7H9zm4 0h2v7h-2zm4 0h2v7h-2zM3 20h18v2H3z"/>',
  payments: '<path d="M2 6h20v12H2zm2 2v2h16V8zm0 6v2h6v-2z"/>',
  reports: '<path d="M5 3h10l4 4v14H5zm9 1.5V8h3.5zM8 12v6h2v-6zm4-2v8h2v-8z"/>',
  users: '<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1 20c0-3.3 3.6-6 8-6s8 2.7 8 6v1H1zm17 1v-1c0-1.6-.6-3-1.7-4.2 3.4.2 6.7 1.9 6.7 4.2v1z"/>',
  masters: '<path d="M4 5h16v2H4zm0 6h16v2H4zm0 6h10v2H4z"/>',
  profile: '<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm-9 9c0-4 4-7 9-7s9 3 9 7v1H3z"/>',
  logout: '<path d="M10 3h9v18h-9v-2h7V5h-7zm-1 5l1.4 1.4L8.8 11H15v2H8.8l1.6 1.6L9 16l-4-4z"/>',
};

const icon = (name) =>
  `<svg viewBox="0 0 24 24" class="nav-icon" aria-hidden="true">${ICONS[name]}</svg>`;

const ADMIN_NAV = [
  ["dashboard", "Dashboard", "dashboard.html"],
  ["projects", "Projects", "projects.html"],
  ["vendors", "Vendors", "vendors.html"],
  ["payments", "Payments", "payments.html"],
  ["reports", "Reports", "reports.html"],
  ["users", "Users", "users.html"],
  ["masters", "Masters", "masters.html"],
];

const USER_NAV = [["projects", "My Projects", "my-projects.html"]];

export function renderShell(profile, { active, title }) {
  // Hindi is offered on the staff side only; admin screens stay in English.
  if (profile.isAdmin) forceEnglish();
  const nav = profile.isAdmin ? ADMIN_NAV : USER_NAV;
  const app = $("#app");
  const initials = (profile.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  app.insertAdjacentHTML(
    "afterbegin",
    `<aside class="sidebar" id="sidebar">
      <div class="brand"><span class="brand-mark">🍽</span><span>${esc(APP_NAME)}</span></div>
      <nav class="nav">
        ${nav
          .map(
            ([key, label, href]) =>
              `<a href="${href}" class="nav-link ${active === key ? "active" : ""}">${icon(key)}<span>${t(label)}</span></a>`
          )
          .join("")}
      </nav>
      <div class="nav-foot">
        <a href="profile.html" class="nav-link ${active === "profile" ? "active" : ""}">${icon("profile")}<span>${t("My Profile")}</span></a>
        <button class="nav-link" id="logout-btn">${icon("logout")}<span>${t("Log out")}</span></button>
      </div>
    </aside>
    <div class="scrim" id="scrim"></div>`
  );

  $(".main", app).insertAdjacentHTML(
    "afterbegin",
    `<header class="topbar">
      <button class="icon-btn menu-btn" id="menu-btn" aria-label="Menu">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" fill="currentColor"/></svg>
      </button>
      <h1 class="topbar-title">${esc(t(title))}</h1>
      <span class="net-status" id="net-status" hidden>${t("Offline")}</span>
      ${profile.isAdmin ? "" : langToggleHTML()}
      <a href="profile.html" class="avatar" title="${esc(profile.name)} · ${esc(t(ROLES[profile.role]))}">${esc(initials)}</a>
    </header>`
  );

  const toggle = (open) => document.body.classList.toggle("drawer-open", open);
  $("#menu-btn").onclick = () => toggle(true);
  $("#scrim").onclick = () => toggle(false);
  $("#logout-btn").onclick = logout;

  const net = $("#net-status");
  const updateNet = () => (net.hidden = navigator.onLine);
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
  updateNet();

  bindLangToggle(app);
  applyI18n(document);
  document.title = `${t(title)} · ${APP_NAME}`;
  document.body.classList.remove("booting");
}
