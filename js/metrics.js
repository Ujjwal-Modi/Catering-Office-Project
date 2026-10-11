/* Business rules for item status, shared by project page, dashboard and reports. */
import { num } from "./ui.js";

/** Shortfall only counts once a delivery is recorded (received tick or a received qty). */
export const shortfall = (e) =>
  e.received || num(e.receivedQty) > 0 ? Math.max(0, num(e.orderedQty) - num(e.receivedQty)) : 0;

/** pending → not yet ordered; ordered → awaiting delivery; short → received less; received → complete */
export function entryStatus(e) {
  if (!e.ordered) return "pending";
  if (!e.received) return "ordered";
  return shortfall(e) > 0 ? "short" : "received";
}

export const STATUS_INFO = {
  pending: { label: "Not ordered", badge: "badge-gray" },
  ordered: { label: "Ordered", badge: "badge-blue" },
  short: { label: "Short received", badge: "badge-amber" },
  received: { label: "Received", badge: "badge-green" },
};

/** Value of goods ordered / actually received, at the vendor's current rate. */
export const orderedValue = (e, rates) => num(e.orderedQty) * num(rates?.[e.vendorId]);
export const receivedValue = (e, rates) => num(e.receivedQty) * num(rates?.[e.vendorId]);
