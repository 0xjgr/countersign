import type { Verdict } from "../chain/guard.ts";
import type { EscapeAttempt } from "../chain/escape.ts";

export type DemoPayment = {
  recipient: string;
  payee: string;
  yocto: string;
  citation: string;
  unguardedTx: string;
  guardedTx: string;
  verdict: Verdict;
};

export type DemoRun = { recordedAt: string; model: string; payments: DemoPayment[]; escapes: EscapeAttempt[] };
