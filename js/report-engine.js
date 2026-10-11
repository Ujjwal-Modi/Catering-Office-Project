/* Pure report logic: filtering, grouping and row building. No DOM, no Firebase. */
import { num, fmtDate } from "./ui.js";
import { entryStatus, shortfall, orderedValue, receivedValue, STATUS_INFO } from "./metrics.js";

export const GROUP_FIELDS = {
  project: { label: "Project", get: (e, ctx) => ctx.projects[e.projectId]?.name || "" },
  date: { label: "Date", get: (e) => e.date },
  slot: { label: "Time", get: (e) => e.slot },
  vendorType: { label: "Vendor Type", get: (e) => e.vendorType },
  vendor: { label: "Vendor", get: (e) => e.vendorName },
};

const SLOT_RANK = { Morning: 0, Afternoon: 1, Evening: 2, Night: 3 };
const round = (n) => Math.round(n * 100) / 100;
const yesNo = (b) => (b ? "Yes" : "No");

/** Filter entries by every supported criterion. */
export function filterEntries(entries, f) {
  return entries.filter((e) =>
    (!f.from || e.date >= f.from) &&
    (!f.to || e.date <= f.to) &&
    (!f.vendorType || e.vendorType === f.vendorType) &&
    (!f.vendorId || e.vendorId === f.vendorId) &&
    (!f.slot || e.slot === f.slot) &&
    nameMatch(e.createdByName, f.user) &&
    matchStatus(e, f.status));
}

const nameMatch = (name, term) => !term || String(name || "").toLowerCase().includes(term.toLowerCase());

function matchStatus(e, status) {
  if (!status) return true;
  if (status === "open") return entryStatus(e) !== "received"; // pending + ordered + short
  return entryStatus(e) === status;
}

export function filterPhotos(photos, f) {
  return photos.filter((p) => {
    const d = p.date || toISODate(p.createdAt);
    return (!f.from || d >= f.from) && (!f.to || d <= f.to) && (!f.bucket || p.bucket === f.bucket) &&
      nameMatch(p.uploadedByName, f.user);
  });
}

function toISODate(ts) {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const sortEntries = (list, ctx) => [...list].sort((a, b) =>
  (ctx.projects[a.projectId]?.startDate || "").localeCompare(ctx.projects[b.projectId]?.startDate || "") ||
  a.date.localeCompare(b.date) || SLOT_RANK[a.slot] - SLOT_RANK[b.slot] ||
  a.vendorType.localeCompare(b.vendorType) || a.vendorName.localeCompare(b.vendorName));

/** One row per item. ctx = { projects: {id: p}, vendors: {id: v}, rates: {id: rate}, showMoney } */
export function itemRows(entries, ctx) {
  return sortEntries(entries, ctx).map((e) => {
    const p = ctx.projects[e.projectId] || {};
    const row = {
      Project: p.name || "",
      Venue: p.venue || "",
      Date: e.date,
      Time: e.slot,
      "Vendor Type": e.vendorType,
      Vendor: e.vendorName,
      "Vendor Phone": ctx.vendors[e.vendorId]?.phone || "",
      Unit: e.unit,
      "Ordered Qty": num(e.orderedQty),
      "Received Qty": num(e.receivedQty),
      "Short Qty": round(shortfall(e)),
      Ordered: yesNo(e.ordered),
      Received: yesNo(e.received),
      Status: STATUS_INFO[entryStatus(e)].label,
    };
    if (ctx.showMoney) {
      row.Rate = num(ctx.rates[e.vendorId]);
      row["Ordered Value"] = round(orderedValue(e, ctx.rates));
      row["Received Value"] = round(receivedValue(e, ctx.rates));
    }
    row.Remark = e.remark || "";
    row["Entered By"] = e.createdByName || "";
    return row;
  });
}

/** Totals grouped by any combination of GROUP_FIELDS (unit always kept separate). */
export function summaryRows(entries, groupBy, ctx) {
  const keys = groupBy.length ? groupBy : ["vendorType"];
  const groups = new Map();
  for (const e of sortEntries(entries, ctx)) {
    const parts = keys.map((k) => GROUP_FIELDS[k].get(e, ctx));
    const id = [...parts, e.unit].join("\u0001");
    if (!groups.has(id)) {
      const g = { cols: {}, unit: e.unit, n: 0, ord: 0, rec: 0, short: 0, pending: 0, ov: 0, rv: 0, vendors: new Set() };
      keys.forEach((k, i) => (g.cols[GROUP_FIELDS[k].label] = parts[i]));
      groups.set(id, g);
    }
    const g = groups.get(id);
    g.n++;
    g.ord += num(e.orderedQty);
    g.rec += num(e.receivedQty);
    g.short += shortfall(e);
    if (!e.ordered) g.pending++;
    g.ov += orderedValue(e, ctx.rates);
    g.rv += receivedValue(e, ctx.rates);
    g.vendors.add(e.vendorId);
  }
  return [...groups.values()].map((g) => {
    const row = { ...g.cols };
    if (!keys.includes("vendor")) row.Vendors = g.vendors.size;
    Object.assign(row, {
      Unit: g.unit,
      Entries: g.n,
      "Ordered Qty": round(g.ord),
      "Received Qty": round(g.rec),
      "Short Qty": round(g.short),
      "Not Ordered": g.pending,
    });
    if (ctx.showMoney) {
      row["Ordered Value"] = round(g.ov);
      row["Received Value"] = round(g.rv);
    }
    return row;
  });
}

/** One row per project with headline numbers. */
export function projectRows(projectList, entries, photos, ctx) {
  return [...projectList].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((p) => {
    const mine = entries.filter((e) => e.projectId === p.id);
    const count = (s) => mine.filter((e) => entryStatus(e) === s).length;
    const row = {
      Project: p.name,
      "Start Date": p.startDate,
      "End Date": p.endDate,
      Venue: p.venue || "",
      "Event Type": p.eventType || "",
      Pax: num(p.pax),
      "Staff Access": { none: "Open", readonly: "View only", locked: "Locked" }[p.freeze || "none"],
      Items: mine.length,
      "Not Ordered": count("pending"),
      "Awaiting Delivery": count("ordered"),
      "Short Received": count("short"),
      "Fully Received": count("received"),
    };
    if (ctx.showPhotos) row.Photos = photos.filter((x) => x.projectId === p.id).length;
    if (ctx.showMoney) {
      row["Ordered Value"] = round(mine.reduce((s, e) => s + orderedValue(e, ctx.rates), 0));
      row["Received Value"] = round(mine.reduce((s, e) => s + receivedValue(e, ctx.rates), 0));
      row["Per Pax (Received)"] = p.pax ? round(row["Received Value"] / num(p.pax)) : 0;
    }
    row.Remark = p.remark || "";
    return row;
  });
}

export function photoRows(photos, ctx) {
  return [...photos]
    .sort((a, b) => (ctx.projects[a.projectId]?.name || "").localeCompare(ctx.projects[b.projectId]?.name || "") ||
      a.bucket.localeCompare(b.bucket) || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
    .map((p) => ({
      Project: ctx.projects[p.projectId]?.name || "",
      Bucket: p.bucket,
      Date: p.date || toISODate(p.createdAt),
      Remark: p.remark || "",
      "File Name": p.fileName || "",
      "Size (MB)": p.size ? Math.round((p.size / 1048576) * 100) / 100 : 0,
      "Uploaded By": p.uploadedByName || "",
      "Uploaded At": p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString("en-IN") : "",
      Link: p.url,
    }));
}

/** Columns that make sense to total in a footer. */
export const TOTAL_COLUMNS = new Set([
  "Entries", "Not Ordered", "Items", "Awaiting Delivery", "Short Received", "Fully Received", "Photos", "Pax",
  "Ordered Value", "Received Value",
]);

export function describeFilters(f, ctx) {
  const parts = [];
  if (f.projectIds?.length) parts.push(`Projects: ${f.projectIds.map((id) => ctx.projects[id]?.name).join(", ")}`);
  else parts.push("Projects: all");
  if (f.from || f.to) parts.push(`Dates: ${f.from ? fmtDate(f.from) : "start"} – ${f.to ? fmtDate(f.to) : "end"}`);
  if (f.vendorType) parts.push(`Type: ${f.vendorType}`);
  if (f.vendorId) parts.push(`Vendor: ${ctx.vendors[f.vendorId]?.name}`);
  if (f.slot) parts.push(`Time: ${f.slot}`);
  if (f.status) parts.push(`Status: ${f.status === "open" ? "Pending / short" : STATUS_INFO[f.status].label}`);
  if (f.bucket) parts.push(`Bucket: ${f.bucket}`);
  if (f.user) parts.push(`By: ${f.user}`);
  return parts.join("  ·  ");
}
