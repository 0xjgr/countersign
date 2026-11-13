import { Account, JsonRpcProvider } from "near-api-js";

import { CHAIN, requireKey } from "./config.ts";

// note: the baseline every agent framework ships today, a full access key on the agent host
export async function transferUnguarded(payee: string, yocto: bigint): Promise<string> {
  const agent = new Account(CHAIN.AGENT_ID, new JsonRpcProvider({ url: CHAIN.NEAR_RPC }), requireKey("AGENT_FULL_KEY"));
  const outcome = await agent.transfer({ receiverId: payee, amount: yocto });
  return outcome.transaction.hash;
}
