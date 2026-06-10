import type { Customer } from "@prisma/client";

/**
 * Attribution model: LAST-TOUCH within a window.
 *
 * When a communication reaches CONVERTED we create an Order attributed to it. The order is
 * stamped "now", i.e. within ATTRIBUTION_WINDOW_DAYS of the click that drove it — so it counts
 * as campaign-attributed revenue. Phase 4's rollups use the same window when deciding whether an
 * order can be credited to a communication.
 *
 * Simplification (stated as a deliberate tradeoff): real attribution would weigh multiple
 * touches and de-dup across overlapping campaigns. We credit the single last converting
 * communication fully — defensible for a single-marketer mini-CRM, and easy to reason about.
 */
export const ATTRIBUTION_WINDOW_DAYS = 7;

export const ORDER_CATEGORIES = ["Tops", "Denim", "Dresses", "Accessories", "Footwear"] as const;

/**
 * A plausible order value for a conversion: anchored on the customer's historical average order
 * value (±30%), clamped to a sane band, rounded to ₹100. Falls back to a mid band for customers
 * with no history.
 */
export function realisticOrderAmount(customer: Pick<Customer, "ltv" | "totalOrders">): number {
  const avg =
    customer.totalOrders > 0 ? customer.ltv / customer.totalOrders : 1500 + Math.random() * 4500;
  const jittered = avg * (0.7 + Math.random() * 0.6);
  const clamped = Math.min(15000, Math.max(800, jittered));
  return Math.round(clamped / 100) * 100;
}

export function pickCategory(): string {
  return ORDER_CATEGORIES[Math.floor(Math.random() * ORDER_CATEGORIES.length)];
}
