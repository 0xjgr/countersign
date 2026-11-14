import { z } from "zod";

import { CHAIN, EXPLORER_TX } from "../chain/config.ts";
import { Verdict } from "../chain/guard.ts";
import { MODES } from "./anchor-types.ts";
import type { Anchor } from "./anchor-types.ts";
import { listModels, loadAnchors, loadEpisodes } from "./store.ts";
import { renderTable, tally } from "./tally.ts";

const TxStatus = z.object({
  result: z.object({
    status: z.record(z.string(), z.unknown()),
    transaction: z.object({ receiver_id: z.string(), actions: z.array(z.unknown()) }),
    receipts_outcome: z.array(z.object({ outcome: z.object({ logs: z.array(z.string()) }) })),
  }),
});

const VerdictEvent = z.object({
  standard: z.literal("countersign"),
  event: z.literal("verdict"),
  data: z.object({ payee: z.string(), amount: z.string(), verdict: Verdict, run: z.string().nullable() }),
});

async function fetchTxFrom(rpc: string, hash: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tx", params: { tx_hash: hash, sender_account_id: CHAIN.AGENT_ID, wait_until: "FINAL" } }),
    });
    const body: unknown = response.ok ? await response.json() : undefined;
    const parsed = TxStatus.safeParse(body);
    if (parsed.success) return parsed.data.result;
    // note: public rpcs answer 429 inside a 200 body, only a rate limit is worth waiting for
    const isRateLimited = response.status === 429 || JSON.stringify(body ?? "").includes("-429");
    if (response.ok && !isRateLimited) return undefined;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  return undefined;
}

// note: the regular rpc keeps a few days of history, the archival one has the rest but a tighter rate limit
async function fetchTx(hash: string) {
  return (await fetchTxFrom(CHAIN.NEAR_RPC, hash)) ?? (await fetchTxFrom(CHAIN.NEAR_ARCHIVAL_RPC, hash));
}

// threat: a results table that only exists in our repo, every row is re-derived from what testnet recorded
async function verifyAnchor(anchor: Anchor): Promise<string | undefined> {
  const tx = await fetchTx(anchor.txHash);
  if (!tx) return "transaction not found";
  if (anchor.mode === "full-access") {
    const isTransfer = tx.transaction.receiver_id === anchor.payee && JSON.stringify(tx.transaction.actions).includes(anchor.sentYocto ?? anchor.yocto);
    return isTransfer && "SuccessValue" in tx.status ? undefined : "transfer does not match";
  }
  const event = tx.receipts_outcome
    .flatMap((r) => r.outcome.logs)
    .filter((log) => log.startsWith("EVENT_JSON:"))
    .map((log) => VerdictEvent.safeParse(JSON.parse(log.slice("EVENT_JSON:".length))))
    .find((parsed) => parsed.success)?.data;
  if (!event) return "no verdict event";
  const isSame =
    event.data.payee === anchor.payee &&
    event.data.amount === anchor.yocto &&
    JSON.stringify(event.data.verdict) === JSON.stringify(anchor.verdict) &&
    (event.data.run ?? "").includes(`:${anchor.episode}:a${anchor.attempt}:${anchor.mode}:`);
  return isSame ? undefined : "event does not match";
}

async function inBatches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(work))));
  return out;
}

for (const model of listModels()) {
  const anchors = loadAnchors(model);
  if (anchors.length === 0) continue;
  console.log(`[verify] model=${model} anchors=${anchors.length} rpc=${CHAIN.NEAR_RPC} archival=${CHAIN.NEAR_ARCHIVAL_RPC}`);
  const problems = await inBatches(anchors, 4, verifyAnchor);
  const verified = anchors.filter((_, i) => problems[i] === undefined);
  anchors.forEach((anchor, i) => {
    if (problems[i]) console.log(`[verify] mismatch ${anchor.episode}/${anchor.attempt}/${anchor.mode} reason="${problems[i]}" ${EXPLORER_TX}${anchor.txHash}`);
  });
  console.log(`[verify] ${verified.length}/${anchors.length} transactions match the chain\n`);
  const episodes = loadEpisodes(model);
  console.log(renderTable(MODES.map((mode) => tally(mode, episodes, verified))));
  console.log("");
}
