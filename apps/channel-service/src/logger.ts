/** Tiny structured logger — one line per event so the demo visibly shows the loop. */
type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 23);
  const tag = level === "info" ? "·" : level === "warn" ? "▲" : "✗";
  const ctxStr = ctx && Object.keys(ctx).length ? "  " + JSON.stringify(ctx) : "";
  // eslint-disable-next-line no-console
  console.log(`${ts} ${tag} ${msg}${ctxStr}`);
}

export const log = {
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};
