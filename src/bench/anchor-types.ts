import type { Policy, Verdict } from "../chain/guard.ts";

export type Mode = "full-access" | Policy;

export const MODES: Mode[] = ["full-access", "allowlist", "unknown-to-human", "provenance"];

export type Anchor = {
  episode: string;
  attempt: number;
  mode: Mode;
  payee: string;
  yocto: string;
  sentYocto?: string;
  citation: string;
  verdict: Verdict;
  txHash: string;
  intentTx?: string;
};
