/**
 * Resolve the active image provider from IMAGE_PROVIDER (default `library`). Same pattern as
 * lib/llm/index.ts — the UI/API only ever see the neutral ImageProvider interface, so swapping in a
 * real image model is a one-env-var change with no UI changes.
 *
 *  - library → curated on-brand library (LIVE for this build)
 *  - model   → typed stub that throws until a real image model is wired in
 */
import type { ImageProvider } from "./types";
import { LibraryImageProvider } from "./library-provider";
import { ModelImageProvider } from "./model-provider";

export type { CreativeBrief, GeneratedCreative, ImageProvider } from "./types";

let cached: ImageProvider | null = null;

export function getImageProvider(): ImageProvider {
  if (cached) return cached;
  const provider = (process.env.IMAGE_PROVIDER ?? "library").toLowerCase();
  cached = provider === "model" ? new ModelImageProvider() : new LibraryImageProvider();
  return cached;
}
