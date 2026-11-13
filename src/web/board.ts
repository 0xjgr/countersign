import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import type { AttemptReport } from "./attempt.ts";

const BOARD_FILE = process.env.BOARD_FILE ?? "var/board.json";
const KEEP = 200;

export type BoardEntry = { id: string; at: string; verdicts: string[]; payees: string[]; settled: boolean };

const entries: BoardEntry[] = existsSync(BOARD_FILE) ? JSON.parse(readFileSync(BOARD_FILE, "utf8")) : [];

export function recordAttempt(report: AttemptReport): BoardEntry {
  const entry = {
    id: report.id,
    at: report.at,
    verdicts: report.payments.map((p) => (p.verdict.kind === "allow" ? "allow" : `${p.verdict.kind}:${p.verdict.rule}`)),
    payees: report.payments.map((p) => p.payee),
    settled: report.payments.some((p) => p.verdict.kind === "allow"),
  };
  entries.unshift(entry);
  entries.length = Math.min(entries.length, KEEP);
  mkdirSync(BOARD_FILE.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(BOARD_FILE, JSON.stringify(entries, null, 2));
  return entry;
}

export function readBoard(): { total: number; settled: number; entries: BoardEntry[] } {
  return { total: entries.length, settled: entries.filter((e) => e.settled).length, entries: entries.slice(0, 50) };
}
