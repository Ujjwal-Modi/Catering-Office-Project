/* File exports: Excel, CSV, PDF, ZIP. Libraries are loaded on first use. */
import { toast } from "./ui.js";

const LIBS = {
  xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  autotable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
  jszip: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
};

const loaded = {};
function loadScript(key) {
  loaded[key] ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = LIBS[key];
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load export library. Check your internet."));
    document.head.appendChild(s);
  });
  return loaded[key];
}

function saveBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const safeSheetName = (n) => String(n).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";

/** sheets: [{ name, rows: [{col: value}] }] */
export async function downloadXlsx(filename, sheets) {
  try {
    await loadScript("xlsx");
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    const used = new Set();
    for (const sheet of sheets) {
      const rows = sheet.rows.length ? sheet.rows : [{ Info: "No data for the selected filters" }];
      const ws = XLSX.utils.json_to_sheet(rows);
      const cols = Object.keys(rows[0]);
      ws["!cols"] = cols.map((c) => ({
        wch: Math.min(48, Math.max(c.length, ...rows.slice(0, 300).map((r) => String(r[c] ?? "").length)) + 2),
      }));
      let name = safeSheetName(sheet.name);
      for (let i = 2; used.has(name); i++) name = safeSheetName(`${sheet.name.slice(0, 27)} ${i}`);
      used.add(name);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    XLSX.writeFile(wb, filename);
  } catch (err) {
    toast(err.message, "error");
  }
}

export function downloadCsv(filename, rows) {
  if (!rows.length) return toast("Nothing to export.", "warn");
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.map(cell).join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
  // BOM so Excel opens ₹ and Hindi text correctly.
  saveBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), filename);
}

/** rows: [{col: value}] — columns taken from the first row. */
export async function downloadPdf(filename, { title, subtitle = "", rows }) {
  if (!rows.length) return toast("Nothing to export.", "warn");
  try {
    await loadScript("jspdf");
    await loadScript("autotable");
    const { jsPDF } = window.jspdf;
    const cols = Object.keys(rows[0]);
    const pdf = new jsPDF({ orientation: cols.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
    pdf.setFontSize(14);
    pdf.text(title, 40, 40);
    pdf.setFontSize(9);
    pdf.setTextColor(100);
    pdf.text(pdf.splitTextToSize(subtitle, pdf.internal.pageSize.getWidth() - 80), 40, 56);
    pdf.autoTable({
      startY: 74,
      head: [cols],
      // jsPDF's built-in font has no ₹ glyph, so use "Rs." in PDFs.
      body: rows.map((r) => cols.map((c) => String(r[c] ?? "").replace(/₹/g, "Rs. "))),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [15, 118, 110] },
      alternateRowStyles: { fillColor: [246, 248, 250] },
      margin: { left: 40, right: 40 },
      didDrawPage: () => {
        const h = pdf.internal.pageSize.getHeight();
        pdf.setFontSize(8);
        pdf.text(`Page ${pdf.internal.getNumberOfPages()} · Generated ${new Date().toLocaleString("en-IN")}`, 40, h - 20);
      },
    });
    pdf.save(filename);
  } catch (err) {
    toast(err.message, "error");
  }
}

/**
 * Downloads original photos into a ZIP, organised as Project/Bucket/file.
 * Requires CORS to be enabled on the Storage bucket (see README → cors.json).
 */
export async function downloadPhotosZip(filename, photos, onProgress = () => {}) {
  if (!photos.length) return toast("No photos to download.", "warn");
  await loadScript("jszip");
  const zip = new window.JSZip();
  let failed = 0;
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    onProgress(i + 1, photos.length);
    try {
      const res = await fetch(p.url);
      if (!res.ok) throw new Error(res.status);
      const clean = (s) => String(s || "Other").replace(/[\\/:*?"<>|]/g, "-").trim();
      const name = `${clean(p.projectName)}/${clean(p.bucket)}/${String(i + 1).padStart(3, "0")}${p.remark ? "-" + clean(p.remark).slice(0, 40) : ""}.${(p.path || "").split(".").pop() || "jpg"}`;
      zip.file(name, await res.blob());
    } catch {
      failed++;
    }
  }
  if (failed === photos.length) {
    toast("Photos could not be downloaded. Enable CORS on your Storage bucket (see README).", "error");
    return;
  }
  saveBlob(await zip.generateAsync({ type: "blob" }), filename);
  if (failed) toast(`${failed} photo(s) could not be added.`, "warn");
}
