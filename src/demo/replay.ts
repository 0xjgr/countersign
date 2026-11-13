import { readFileSync } from "node:fs";

import { CHAIN, EXPLORER_TX } from "../chain/config.ts";
import type { DemoRun } from "./transcript.ts";

async function finalStatus(hash: string): Promise<{ ok: boolean; logs: string[] }> {
  const response = await fetch(CHAIN.NEAR_ARCHIVAL_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tx", params: { tx_hash: hash, sender_account_id: CHAIN.AGENT_ID, wait_until: "FINAL" } }),
  });
  const body = (await response.json()) as { result?: { status: object; receipts_outcome: { outcome: { logs: string[] } }[] } };
  if (!body.result) return { ok: false, logs: [] };
  return { ok: "SuccessValue" in body.result.status, logs: body.result.receipts_outcome.flatMap((r) => r.outcome.logs) };
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
