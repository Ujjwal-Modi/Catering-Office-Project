import { auth, db, isConfigured } from "../firebase.js";
import { signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut, doc, getDoc } from "../sdk.js";
import { toEmail, isUsernameLogin, loadProfile, homeFor } from "../auth.js";
import { APP_NAME } from "../firebase-config.js";
import { $, toast, errorText, setBusy, qs, addPasswordToggles } from "../ui.js";
import { t, applyI18n, langToggleHTML, bindLangToggle } from "../i18n.js";

$("#app-name").textContent = APP_NAME;
$("#lang-slot").innerHTML = langToggleHTML();
bindLangToggle();
applyI18n();
addPasswordToggles();
const notice = $("#notice");
const showNotice = (html) => { notice.innerHTML = t(html); notice.hidden = false; };

if (!isConfigured) {
  showNotice("Firebase is not configured yet. Open <b>js/firebase-config.js</b> and paste your project's config (see README).");
  $("#login-form").hidden = true;
} else {
  init();
}

async function init() {
  if (qs("msg") === "inactive") showNotice("Your account is inactive or was removed. Contact an admin.");

  // Show "create root admin" link only before first setup.
  getDoc(doc(db, "meta", "setup"))
    .then((s) => ($("#setup-link").hidden = s.exists()))
    .catch(() => {});

  // Already signed in? Go straight to the right home page.
  const stop = onAuthStateChanged(auth, async (user) => {
    stop();
    if (!user || qs("msg")) return;
    const profile = await loadProfile(user.uid).catch(() => null);
    if (profile?.active) location.href = homeFor(profile);
  });

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    if (!form.checkValidity()) return form.reportValidity();
    const btn = form.querySelector("button");
    setBusy(btn, true, "Signing in…");
    try {
      const cred = await signInWithEmailAndPassword(auth, toEmail(form.loginId.value), form.password.value);
      const profile = await loadProfile(cred.user.uid);
      if (!profile || !profile.active) {
        await signOut(auth);
        showNotice("Your account is inactive. Contact an admin.");
        return;
      }
      location.href = homeFor(profile);
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(btn, false);
    }
  });

  $("#forgot-link").addEventListener("click", async (e) => {
    e.preventDefault();
    const id = $("#login-id").value.trim();
    if (!id) return toast("Enter your email first, then tap Forgot password.", "warn");
    const email = toEmail(id);
    if (isUsernameLogin(email)) return toast("Username logins can't reset by email. Ask an admin to reset your access.", "warn");
    try {
      await sendPasswordResetEmail(auth, email);
      toast("Password reset email sent.", "success");
    } catch (err) {
      toast(errorText(err), "error");
    }
  });
}
