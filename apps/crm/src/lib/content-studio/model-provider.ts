/**
 * ModelImageProvider — typed stub for a real image model (DALL·E / Imagen / SDXL / …). Throws so the
 * swap-in path is obvious and defensible: select it with IMAGE_PROVIDER=model, implement generate()
 * against the same ImageProvider interface, and nothing else changes. Mirrors the Anthropic LLM stub.
 */
import type { ImageProvider, GeneratedCreative } from "./types";

export class ModelImageProvider implements ImageProvider {
  async generate(): Promise<GeneratedCreative> {
    throw new Error("image model not configured");
  }
}
