# Catering Office — Vendor & Project Tracker

A mobile-first web app for catering projects: admins manage projects, vendors, staff, payments and reports; staff record vendor supplies and photos from site on their phones.

Built with plain **HTML + CSS + JavaScript** (no build step) on **Firebase** (Auth, Firestore, Storage).

> **⏸ Photos are temporarily switched off.** The app runs on the free Spark plan without Firebase Storage. All photo code is still in the project, marked `PHOTOS DISABLED`. See [Turning photos back on](#turning-photos-back-on).

---

## Features

**Roles**
- **Root admin**: created once on first setup. Can't be edited or deactivated by anyone else.
- **Admins**: full access. Can create other admins and staff.
- **Staff**: see only the projects assigned to them.

**Projects (admin)**: dates, name, venue, event type, pax, contact, remark. You can assign one or more staff. Each project has a staff access mode:
- **Open**: staff can add and edit.
- **View only**: staff can open the project but can't edit anything.
- **Locked**: staff can't open it at all.

These modes apply instantly, even on phones that already have the project open.

**Items (staff and admin)**:
- Choose a vendor type, then the vendor name. The unit fills in from the vendor master.
- Pick a date inside the project's date range and a time (Morning / Afternoon / Evening / Night).
- Enter the ordered quantity and the received quantity.
- **Ordered** and **Received** ticks can only be set by admins. Staff see them but can't change them.
- After an admin ticks *Ordered*, staff can't change that item's details. After *Received*, staff can't change the received quantity.
- If someone adds the same vendor, date and time twice, the app warns them.

**Photos** *(currently disabled)*: upload into buckets (Delivery, Kitchen, Bills…), with an optional remark on each photo. You can use the camera or the gallery. Photos are stored **at original quality (no compression)** so they can be reused on social media; each upload shows a progress %. Max 50 MB per photo.

**Vendor master**: type, name, phone, unit, plus rate per unit (only admins can see it), GSTIN, notes and an active/inactive switch.

**Masters**: editable lists of vendor types, units, event types and photo buckets.

**Payments**: record payments to vendors (cash, UPI, bank, cheque). For each vendor you see ordered value, received value, amount paid and balance due. Exports to Excel.

**Reports** (download as Excel / CSV / PDF, or print):
- Item details, pending or short items
- Summary grouped by any combination of project, date, time, vendor type and vendor
- Project overview (counts, values, cost per pax)
- Photo report by bucket (gallery, Excel with links, and a ZIP of all photos)
- **Complete workbook**: every report on its own sheet, in one Excel file
- Filters: projects, date range (with quick picks like today, this week or this month), vendor type, vendor, time, status, photo bucket and who entered it

**Other useful bits**
- Dashboard with today's items, overdue or short deliveries, and upcoming projects
- **Works offline**: entries made with no signal are saved and sync automatically later. (Photos need internet.)
- Live updates: several staff can work on the same project at once
- Staff can log in with a **username** (no email needed)
- Can be installed on a phone's home screen (PWA manifest)

---

## Setup (about 15 minutes)

### 1. Create the Firebase project
1. Go to <https://console.firebase.google.com>, then **Add project**.
2. **Build → Authentication → Get started →** enable **Email/Password**.
3. **Build → Firestore Database → Create database** (production mode; pick a region such as `asia-south1` Mumbai).
4. *(Skip while photos are off.)* **Build → Storage → Get started.** Firebase now asks for the pay-as-you-go **Blaze** plan before it will turn on Storage. Blaze still has a free monthly allowance, which is plenty for photos at this scale. Set a budget alert in Google Cloud if you want peace of mind.
5. **Project settings → General → Your apps → Web (`</>`)**: register the app and copy the `firebaseConfig`.

### 2. Configure the app
Paste the config into **`js/firebase-config.js`**. You can also change `APP_NAME` there.

### 3. Deploy the security rules (important)
Install the CLI (`npm i -g firebase-tools`), then from this folder run:
```bash
firebase login
firebase use --add            # select your project
firebase deploy --only firestore:rules
```

Without these rules the database is either fully closed or fully open. They are what enforce roles, project assignment and freeze modes.

### 4. Host it
Pick any one:
- **Firebase Hosting**: `firebase deploy --only hosting` (already set up in `firebase.json`)
- **Netlify / Vercel / GitHub Pages**: upload the folder as it is

Then in **Authentication → Settings → Authorized domains**, add your hosting domain if it isn't listed.

### 5. First login
Open the site and tap **"Create the root admin"** (this link only appears before setup is done). Fill in your details. Default master lists are created automatically. Then:
1. **Masters**: adjust vendor types, units, event types and photo buckets.
2. **Vendors**: add your vendors, with rates.
3. **Users**: create staff (an email or a username, plus a password).
4. **Projects**: create a project and assign staff.

### Turning photos back on
1. Upgrade to Blaze and enable Storage (step 4 above).
2. In `js/firebase-config.js`, set `PHOTOS_ENABLED = true`.
3. Un-comment the blocks marked `PHOTOS DISABLED` in `project.html` and `reports.html`. Also un-comment `photoBuckets` in `js/data.js` (`MASTER_KINDS`) so the list shows on the Masters page again.
4. Add `"storage": { "rules": "storage.rules" }` back to `firebase.json`, then run `firebase deploy --only storage`. If the CLI asks to let Storage rules read Firestore, say **yes**.

### (Optional, after photos are on) Enable the "Photos ZIP" download
Browsers need CORS permission to bundle photos into a ZIP:
```bash
gsutil cors set cors.json gs://YOUR_PROJECT.appspot.com
```
Use the bucket name shown in `firebaseConfig.storageBucket`.

---

## Good to know

- **Removing a user**: untick *Active* on the Users page. They are signed out on their next action and can't log in again. Login accounts can't be deleted from the browser; you can delete them later in Firebase Console → Authentication if you need to.
- **Forgotten passwords**: users with an email can use *Forgot password* on the login screen, or an admin can send a reset email. Username logins have no email, so deactivate the old login and create a new one.
- **Rates and balances**: values use the vendor's *current* rate. If a rate changes, past values are recalculated at the new rate.
- **Received tick**: when an admin ticks *Received* on an item with no received quantity, the app fills in the full ordered quantity. You can edit it afterwards.
- **Short quantity**: only counted once a delivery is recorded.

---

## Project structure

```
index.html          Login
setup.html          One-time root admin creation
dashboard.html      Admin dashboard
projects.html       Admin: project list / create / freeze / assign
my-projects.html    Staff: assigned projects
project.html        Project workspace: items, photos, summary (staff and admin)
vendors.html        Vendor master
masters.html        Vendor types, units, event types, photo buckets
users.html          Users and admins
payments.html       Vendor payments and balances
reports.html        Reports and exports
profile.html        Own profile and password

css/style.css       The single stylesheet (mobile-first)

js/firebase-config.js   ← your Firebase keys
js/sdk.js               Firebase SDK imports (version pinned here)
js/firebase.js          Firebase initialisation (with offline cache)
js/auth.js              Login helpers, page guard, roles
js/layout.js            Sidebar / top bar
js/ui.js                Shared helpers: modal, toast, formatting
js/data.js              All database and storage calls
js/metrics.js           Item status and value rules
js/report-engine.js     Report grouping and filtering (pure functions)
js/export.js            Excel / CSV / PDF / ZIP downloads
js/pages/*.js           One script per page

firestore.rules     Database security rules
storage.rules       Photo storage rules
firebase.json       Firebase CLI config (rules, hosting, emulators)
cors.json           CORS config for the photo ZIP download
tests/              Security-rule tests (run with the Firebase emulator)
```

### Data model (Firestore)
| Path | What it holds |
|---|---|
| `users/{uid}` | name, phone, email, role (`root`/`admin`/`user`), active |
| `meta/setup` | marks that first-time setup is done |
| `masters/lists` | vendorTypes[], units[], eventTypes[], photoBuckets[] |
| `vendors/{id}` | type, name, phone, unit, gstin, notes, active |
| `vendorPrivate/{vendorId}` | rate (admins only) |
| `projects/{id}` | name, startDate, endDate, venue, eventType, pax, contact, remark, assignedUsers[], freeze |
| `projects/{id}/entries/{id}` | vendorId, vendorName, vendorType, unit, date, slot, orderedQty, receivedQty, ordered, received, remark, createdBy… |
| `projects/{id}/photos/{id}` | bucket, remark, date, url, path, uploadedBy… |
| `payments/{id}` | vendorId, projectId, date, amount, mode, reference, note |

### Running the rule tests
```bash
cd tests && npm install && npm test
```
You need Java installed for the Firebase emulator.
