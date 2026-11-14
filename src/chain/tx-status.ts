import { z } from "zod";

import { CHAIN } from "./config.ts";

const TxStatus = z.object({
  result: z.object({
    status: z.record(z.string(), z.unknown()),
    transaction: z.object({ receiver_id: z.string(), actions: z.array(z.unknown()) }),
    receipts_outcome: z.array(z.object({ outcome: z.object({ logs: z.array(z.string()) }) })),
  }),
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
export async function fetchTx(hash: string) {
  return (await fetchTxFrom(CHAIN.NEAR_RPC, hash)) ?? (await fetchTxFrom(CHAIN.NEAR_ARCHIVAL_RPC, hash));
}
