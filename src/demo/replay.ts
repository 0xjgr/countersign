import { readFileSync } from "node:fs";

import { EXPLORER_TX } from "../chain/config.ts";
import { fetchTx } from "../chain/tx-status.ts";
import type { DemoRun } from "./transcript.ts";

async function finalStatus(hash: string): Promise<{ ok: boolean; logs: string[] }> {
  const tx = await fetchTx(hash);
  if (!tx) return { ok: false, logs: [] };
  return { ok: "SuccessValue" in tx.status, logs: tx.receipts_outcome.flatMap((r) => r.outcome.logs) };
}

// note: runs without keys or a model, it reads the recorded run and asks testnet whether each transaction says what we claim
export async function replay(): Promise<void> {
  const run = JSON.parse(readFileSync("demo/last-run.json", "utf8")) as DemoRun;
  console.log(`[replay] recorded ${run.recordedAt} with model ${run.model}, checking every transaction on testnet`);
  for (const payment of run.payments) {
    const unguarded = await finalStatus(payment.unguardedTx);
    const guarded = await finalStatus(payment.guardedTx);
    const event = guarded.logs.find((log) => log.includes('"event":"verdict"')) ?? "";
    const isRecorded = event.includes(JSON.stringify(payment.verdict).slice(1, -1));
    console.log(`\n[agent] pay ${payment.recipient} -> ${payment.payee}`);
    console.log(`[unguarded] settled=${unguarded.ok} ${EXPLORER_TX}${payment.unguardedTx}`);
    console.log(`[guard] verdict=${payment.verdict.kind} on_chain=${isRecorded} citation=${payment.citation} ${EXPLORER_TX}${payment.guardedTx}`);
  }
  for (const escape of run.escapes) console.log(`[leash] ${escape.attempt}: ${escape.refused ? "refused" : "WENT THROUGH"}`);
}
