import { auth } from "../firebase.js";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "../sdk.js";
import { requireAuth, ROLES, loginLabel, logout } from "../auth.js";
import { renderShell } from "../layout.js";
import { updateOwnProfile } from "../data.js";
import { $, toast, errorText, setBusy, addPasswordToggles } from "../ui.js";
import { t } from "../i18n.js";

const profile = await requireAuth();
renderShell(profile, { active: "profile", title: "My Profile" });

const f = $("#profile-form");
f.name.value = profile.name || "";
f.phone.value = profile.phone || "";
$("#login-id").value = loginLabel(profile.email);
$("#role").value = t(ROLES[profile.role]);
addPasswordToggles();
$("#logout").onclick = logout;

f.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!f.checkValidity()) return f.reportValidity();
  const btn = f.querySelector("button[type=submit]");
  setBusy(btn, true);
  try {
    await updateOwnProfile(profile.uid, { name: f.name.value.trim(), phone: f.phone.value.trim() });
    toast("Profile saved", "success");
  } catch (err) {
    toast(errorText(err), "error");
  } finally {
    setBusy(btn, false);
  }
});

const pf = $("#password-form");
pf.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pf.checkValidity()) return pf.reportValidity();
  if (pf.next.value !== pf.confirm.value) return toast("New passwords don't match.", "error");
  const btn = pf.querySelector("button[type=submit]");
  setBusy(btn, true);
  try {
    const user = auth.currentUser;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pf.current.value));
    await updatePassword(user, pf.next.value);
    pf.reset();
    toast("Password changed", "success");
  } catch (err) {
    toast(errorText(err), "error");
  } finally {
    setBusy(btn, false);
  }
});
