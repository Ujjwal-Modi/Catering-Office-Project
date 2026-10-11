/* Authentication, session guard and role helpers. */
import { auth, db, isConfigured } from "./firebase.js";
import { onAuthStateChanged, signOut, doc, getDoc } from "./sdk.js";
import { USERNAME_DOMAIN } from "./firebase-config.js";

export const ROLES = {
  root: "Root Admin",
  admin: "Admin",
  user: "Staff",
};

export const isAdminRole = (role) => role === "root" || role === "admin";

/** "ramesh" → "ramesh@staff.catering.local"; emails pass through unchanged. */
export function toEmail(loginId) {
  const id = String(loginId || "").trim().toLowerCase();
  return id.includes("@") ? id : `${id}@${USERNAME_DOMAIN}`;
}

/** Inverse of toEmail for display. */
export function loginLabel(email) {
  const suffix = "@" + USERNAME_DOMAIN;
  return email?.endsWith(suffix) ? email.slice(0, -suffix.length) : email || "";
}

export const isUsernameLogin = (email) => !!email?.endsWith("@" + USERNAME_DOMAIN);

export async function logout() {
  await signOut(auth);
  location.href = "index.html";
}

export function homeFor(profile) {
  return isAdminRole(profile.role) ? "dashboard.html" : "my-projects.html";
}

/** Read the signed-in user's profile document (or null). */
export async function loadProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

/**
 * Guard a page. Resolves with the user's profile, or redirects.
 *   requireAuth()                 any active user
 *   requireAuth({ admin: true })  admins only
 */
export function requireAuth({ admin = false } = {}) {
  if (!isConfigured) {
    location.href = "index.html";
    return new Promise(() => {});
  }
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, async (user) => {
      stop();
      if (!user) {
        location.href = "index.html";
        return;
      }
      let profile = null;
      try {
        profile = await loadProfile(user.uid);
      } catch (e) {
        console.error(e);
      }
      if (!profile || profile.active !== true) {
        await signOut(auth);
        location.href = "index.html?msg=inactive";
        return;
      }
      profile.isAdmin = isAdminRole(profile.role);
      if (admin && !profile.isAdmin) {
        location.href = "my-projects.html";
        return;
      }
      resolve(profile);
    });
  });
}
