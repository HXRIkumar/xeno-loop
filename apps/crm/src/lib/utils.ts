import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format whole INR with Indian digit grouping, e.g. 52205 -> "₹52,205". */
export function inr(amount: number): string {
  return "₹" + new Intl.NumberFormat("en-IN").format(Math.round(amount));
}

/** "3 days ago" / "5 months ago" — compact relative time for last-order columns. */
export function relativeDays(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Safe percentage with no NaN: pct(3, 10) -> 30. */
export function pct(num: number, denom: number): number {
  if (!denom) return 0;
  return Math.round((num / denom) * 100);
}
