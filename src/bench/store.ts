import { existsSync, readFileSync, readdirSync } from "node:fs";

import type { Anchor } from "./anchor-types.ts";
import { traceDir } from "./episode.ts";
import type { Episode } from "./episode.ts";

export function anchorFile(model: string): string {
  return `${traceDir(model)}/anchors.json`;
}

export function loadEpisodes(model: string): Episode[] {
  const dir = traceDir(model);
  return readdirSync(dir)
    .filter((f) => /^u\d+-(clean|i\d+)\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Episode);
}

export function loadAnchors(model: string): Anchor[] {
  const file = anchorFile(model);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Anchor[]) : [];
}

export function listModels(): string[] {
  return existsSync("bench/traces") ? readdirSync("bench/traces") : [];
}
