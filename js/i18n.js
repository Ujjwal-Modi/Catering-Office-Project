/*
 * English / Hindi for the staff side of the app.
 * Keys are the English text itself, so anything without a Hindi entry simply
 * stays in English. Admin pages always run in English (see forceEnglish).
 * Placeholders like {n} are filled from the vars object: t("{n} items", { n: 3 }).
 */

const KEY = "lang";
let forced = null;

function stored() {
  try { return localStorage.getItem(KEY) === "hi" ? "hi" : "en"; } catch { return "en"; }
}

export const lang = () => forced || stored();

export function setLang(value) {
  try { localStorage.setItem(KEY, value); } catch { /* private mode: just this page */ }
  location.reload();
}

/** Admin screens stay in English whatever the device setting is. */
export function forceEnglish() {
  forced = "en";
  document.documentElement.lang = "en";
}

export const locale = () => (lang() === "hi" ? "hi-IN" : "en-IN");

export function t(text, vars) {
  let out = (lang() === "hi" && HI[text]) || text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return out;
}

/**
 * Translate static HTML: elements with data-i18n (text), data-i18n-placeholder,
 * data-i18n-title, data-i18n-aria. The English text in the markup is the key.
 */
export function applyI18n(root = document) {
  document.documentElement.lang = lang();
  if (lang() === "en") return;
  root.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.textContent.trim())));
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.placeholder)));
  root.querySelectorAll("[data-i18n-title]").forEach((el) => (el.title = t(el.title)));
}

/** "हिंदी" / "English" switch button. */
export function langToggleHTML(cls = "btn btn-sm") {
  const next = lang() === "hi" ? "en" : "hi";
  return `<button type="button" class="${cls} lang-toggle" data-lang="${next}" title="${next === "hi" ? "हिंदी में देखें" : "View in English"}">${next === "hi" ? "हिंदी" : "English"}</button>`;
}

export function bindLangToggle(root = document) {
  root.querySelectorAll("[data-lang]").forEach((b) => (b.onclick = () => setLang(b.dataset.lang)));
}

const HI = {
  /* ---- shell / common ---- */
  "My Projects": "मेरे प्रोजेक्ट",
  "My Profile": "मेरी प्रोफ़ाइल",
  "Project": "प्रोजेक्ट",
  "Log out": "लॉग आउट",
  "Offline": "ऑफ़लाइन",
  "Loading…": "लोड हो रहा है…",
  "Saving…": "सेव हो रहा है…",
  "Save": "सेव करें",
  "Cancel": "रद्द करें",
  "Close": "बंद करें",
  "Delete": "हटाएँ",
  "Edit": "बदलें",
  "Please confirm": "कृपया पुष्टि करें",
  "Saved": "सेव हो गया",
  "Saved offline — will sync when internet returns": "ऑफ़लाइन सेव हुआ — इंटरनेट आने पर अपने आप सिंक होगा",
  "Something went wrong.": "कुछ गड़बड़ हो गई।",
  "Show password": "पासवर्ड दिखाएँ",
  "Hide password": "पासवर्ड छिपाएँ",

  /* ---- errors ---- */
  "Wrong login ID or password.": "लॉगिन ID या पासवर्ड गलत है।",
  "Password must be at least 6 characters.": "पासवर्ड कम से कम 6 अक्षर का होना चाहिए।",
  "Login ID is not valid.": "लॉगिन ID सही नहीं है।",
  "Too many attempts. Try again in a few minutes.": "बहुत ज़्यादा कोशिशें हुईं। कुछ मिनट बाद फिर कोशिश करें।",
  "No internet connection.": "इंटरनेट कनेक्शन नहीं है।",
  "You don't have permission to do that.": "आपको यह करने की अनुमति नहीं है।",
  "Can't reach the server. Check your internet.": "सर्वर से जुड़ नहीं पा रहे। इंटरनेट जाँचें।",

  /* ---- login ---- */
  "Sign in to continue": "आगे बढ़ने के लिए लॉग इन करें",
  "Email or username": "ईमेल या यूज़रनेम",
  "Password": "पासवर्ड",
  "Sign in": "लॉग इन करें",
  "Signing in…": "लॉग इन हो रहा है…",
  "Forgot password?": "पासवर्ड भूल गए?",
  "Your account is inactive or was removed. Contact an admin.": "आपका अकाउंट बंद है या हटा दिया गया है। एडमिन से संपर्क करें।",
  "Your account is inactive. Contact an admin.": "आपका अकाउंट बंद है। एडमिन से संपर्क करें।",
  "Enter your email first, then tap Forgot password.": "पहले अपना ईमेल डालें, फिर 'पासवर्ड भूल गए?' दबाएँ।",
  "Username logins can't reset by email. Ask an admin to reset your access.": "यूज़रनेम वाले लॉगिन का पासवर्ड ईमेल से रीसेट नहीं होता। एडमिन से कहें।",
  "Password reset email sent.": "पासवर्ड रीसेट ईमेल भेज दिया गया।",

  /* ---- statuses ---- */
  "ongoing": "चालू",
  "upcoming": "आने वाला",
  "completed": "पूरा हुआ",
  "Open": "खुला",
  "View only": "सिर्फ़ देखें",
  "Locked": "लॉक",
  "Not ordered": "ऑर्डर नहीं हुआ",
  "Ordered": "ऑर्डर हुआ",
  "Short received": "कम मिला",
  "Received": "मिल गया",
  "Morning": "सुबह",
  "Afternoon": "दोपहर",
  "Evening": "शाम",
  "Night": "रात",
  "Staff": "स्टाफ़",

  /* ---- my projects ---- */
  "Hello, {name} 👋": "नमस्ते, {name} 👋",
  "Search projects…": "प्रोजेक्ट खोजें…",
  "All": "सभी",
  "Ongoing": "चालू",
  "Upcoming": "आने वाले",
  "Completed": "पूरे हुए",
  "No projects match.": "कोई प्रोजेक्ट नहीं मिला।",
  "No projects assigned to you yet.": "अभी आपको कोई प्रोजेक्ट नहीं दिया गया है।",
  "This project is locked by admin.": "इस प्रोजेक्ट को एडमिन ने लॉक किया है।",
  "{n} pax": "{n} मेहमान",

  /* ---- project page ---- */
  "Loading project…": "प्रोजेक्ट लोड हो रहा है…",
  "Items": "सामान",
  "Summary": "सारांश",
  "All times": "सभी समय",
  "Any status": "कोई भी स्थिति",
  "Search vendor, remark…": "वेंडर, टिप्पणी खोजें…",
  "No project selected.": "कोई प्रोजेक्ट नहीं चुना गया।",
  "Project not found or you don't have access.": "प्रोजेक्ट नहीं मिला या आपको अनुमति नहीं है।",
  "This project is not assigned to you.": "यह प्रोजेक्ट आपको नहीं दिया गया है।",
  "🔒 This project is locked by admin. You can't open it right now.": "🔒 इस प्रोजेक्ट को एडमिन ने लॉक किया है। अभी आप इसे नहीं खोल सकते।",
  "← Back to projects": "← प्रोजेक्ट पर वापस",
  "👁 Admin has set this project to view only for you — you can view it but not make changes.": "👁 एडमिन ने यह प्रोजेक्ट आपके लिए सिर्फ़ देखने लायक रखा है — आप बदलाव नहीं कर सकते।",
  "Vendor type": "वेंडर का प्रकार",
  "Vendor name": "वेंडर का नाम",
  "Vendor": "वेंडर",
  "Date": "तारीख",
  "Unit": "इकाई",
  "Time": "समय",
  "Ordered quantity": "ऑर्डर की मात्रा",
  "Received quantity": "मिली मात्रा",
  "Remark": "टिप्पणी",
  "Select type": "प्रकार चुनें",
  "Select vendor": "वेंडर चुनें",
  "Select type first": "पहले प्रकार चुनें",
  "Auto from vendor": "वेंडर से अपने आप",
  "Optional": "वैकल्पिक",
  "unit": "इकाई",
  "Select a vendor.": "वेंडर चुनें।",
  "Select a time (Morning / Afternoon / Evening / Night).": "समय चुनें (सुबह / दोपहर / शाम / रात)।",
  "Ordered quantity must be more than 0.": "ऑर्डर की मात्रा 0 से ज़्यादा होनी चाहिए।",
  "Date must be within the project dates.": "तारीख प्रोजेक्ट की तारीखों के बीच होनी चाहिए।",
  "No vendors in the master yet.": "अभी कोई वेंडर नहीं जोड़ा गया है।",
  " Ask an admin to add vendors.": " एडमिन से वेंडर जोड़ने को कहें।",
  "➕ Add item": "➕ सामान जोड़ें",
  "tap to open": "खोलने के लिए दबाएँ",
  "tap to collapse": "बंद करने के लिए दबाएँ",
  "Save item": "सामान सेव करें",
  "Add anyway": "फिर भी जोड़ें",
  "{vendor} already has {qty} {unit} for {day} {slot}. Add another entry anyway?": "{vendor} का {day} {slot} के लिए पहले से {qty} {unit} है। फिर भी नई एंट्री जोड़ें?",
  "Item added": "सामान जुड़ गया",
  "All dates": "सभी तारीखें",
  "All vendor types": "सभी वेंडर प्रकार",
  "No items match the filters.": "फ़िल्टर से कोई सामान नहीं मिला।",
  "No items added yet.": "अभी कोई सामान नहीं जोड़ा गया।",
  "{n} item": "{n} सामान",
  "{n} items": "{n} सामान",
  "Ordered qty": "ऑर्डर मात्रा",
  "Received qty": "मिली मात्रा",
  "Received qty saved": "मिली मात्रा सेव हो गई",
  "Only admin can untick": "सिर्फ़ एडमिन हटा सकता है",
  "Mark as \"{flag}\"? Once ticked, only an admin can untick it.": "\"{flag}\" पर टिक करें? टिक करने के बाद सिर्फ़ एडमिन ही इसे हटा सकता है।",
  "Tick": "टिक करें",
  "Delete {vendor} · {qty} {unit} on {day} {slot}?": "{vendor} · {qty} {unit} ({day} {slot}) हटाएँ?",
  "Item deleted": "सामान हटा दिया गया",
  "Edit item": "सामान बदलें",
  "Item updated": "सामान अपडेट हो गया",
  "This item is already ordered — only received quantity and remark can be changed.": "यह सामान ऑर्डर हो चुका है — सिर्फ़ मिली मात्रा और टिप्पणी बदल सकते हैं।",
  "This item is already ordered and received — only the remark can be changed.": "यह सामान ऑर्डर हो चुका है और मिल गया है — सिर्फ़ टिप्पणी बदल सकते हैं।",
  "Once ticked, Ordered and Received can only be unticked by an admin.": "एक बार टिक करने के बाद 'ऑर्डर हुआ' और 'मिल गया' सिर्फ़ एडमिन हटा सकता है।",
  "Add items to see the summary.": "सारांश देखने के लिए सामान जोड़ें।",
  "Totals by vendor": "वेंडर के हिसाब से कुल",
  "Entries": "एंट्री",
  "Short": "कमी",

  /* ---- vendors ---- */
  "Vendors": "वेंडर",
  "Vendor Master": "वेंडर सूची",
  "Vendor master": "वेंडर सूची",
  "+ Add vendor": "+ वेंडर जोड़ें",
  "Add vendor": "वेंडर जोड़ें",
  "Search name, phone…": "नाम, फ़ोन खोजें…",
  "Type": "प्रकार",
  "Phone number": "फ़ोन नंबर",
  "kg, litre, piece…": "किलो, लीटर, पीस…",
  "Address / notes": "पता / नोट्स",
  "{n} vendor": "{n} वेंडर",
  "{n} vendors": "{n} वेंडर",
  "Added by {name}": "{name} ने जोड़ा",
  "No vendors match your filters.": "फ़िल्टर से कोई वेंडर नहीं मिला।",
  "No vendors yet. Add your first vendor.": "अभी कोई वेंडर नहीं है। पहला वेंडर जोड़ें।",
  "A vendor with this name already exists in this type.": "इस प्रकार में इस नाम का वेंडर पहले से है।",
  "Vendor added": "वेंडर जुड़ गया",
  "Check the details before saving — once added, only an admin can change or remove a vendor.": "सेव करने से पहले जानकारी जाँच लें — जोड़ने के बाद सिर्फ़ एडमिन ही वेंडर को बदल या हटा सकता है।",

  /* ---- profile ---- */
  "My details": "मेरी जानकारी",
  "Name": "नाम",
  "Phone": "फ़ोन",
  "Login ID": "लॉगिन ID",
  "Role": "भूमिका",
  "Change password": "पासवर्ड बदलें",
  "Current password": "मौजूदा पासवर्ड",
  "New password": "नया पासवर्ड",
  "Confirm new password": "नया पासवर्ड फिर से डालें",
  "Profile saved": "प्रोफ़ाइल सेव हो गई",
  "New passwords don't match.": "नए पासवर्ड मेल नहीं खाते।",
  "Password changed": "पासवर्ड बदल गया",
  "Language": "भाषा",
};
