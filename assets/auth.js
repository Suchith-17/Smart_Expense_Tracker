// assets/auth.js
// No auth — instantly boot the app as a "Guest" and hide the login UI.

const $ = (id) => document.getElementById(id);
const show = (el) => el && el.classList.remove("hidden");
const hide = (el) => el && el.classList.add("hidden");

// Respect saved theme immediately
(function applySavedTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
})();

function bootAppAsGuest() {
  // Hide the login screen, show the app
  hide($("login-view"));
  show($("app-root"));

  // Header name + logout should be hidden for no-auth mode
  const nameTop = $("user-name");
  const logoutBtn = $("logout-btn");
  hide(nameTop);
  hide(logoutBtn);

  // Sidebar footer name
  const sidebarUser = $("sidebar-user");
  if (sidebarUser) sidebarUser.textContent = "Guest";

  // Start the app
  const guest = { displayName: "Guest", email: "guest@example.com", id: "guest" };
  if (typeof window.startExpenseApp === "function") {
    window.startExpenseApp(guest);
  } else {
    // In case app.js loads slightly after this file
    window.addEventListener("load", () => {
      if (typeof window.startExpenseApp === "function") window.startExpenseApp(guest);
    });
  }
}

// If DOM is ready, boot; otherwise wait for it
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAppAsGuest);
} else {
  bootAppAsGuest();
}
