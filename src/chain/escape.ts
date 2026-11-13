import { Account, JsonRpcProvider, KeyPair, actions } from "near-api-js";

import { CHAIN, requireKey } from "./config.ts";

export type EscapeAttempt = { attempt: string; refused: boolean; error: string };

async function tryWithLeash(attempt: string, send: (agent: Account) => Promise<unknown>): Promise<EscapeAttempt> {
  const agent = new Account(CHAIN.AGENT_ID, new JsonRpcProvider({ url: CHAIN.NEAR_RPC }), requireKey("AGENT_LEASH_KEY"));
  return send(agent).then(
    () => ({ attempt, refused: false, error: "" }),
    (error: unknown) => ({ attempt, refused: true, error: (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 160) }),
  );
}

// threat: a fully compromised agent host holding the leash key tries to leave the leash
export async function tryEscapes(attacker: string): Promise<EscapeAttempt[]> {
  return [
    await tryWithLeash("transfer straight to the attacker", (a) => a.transfer({ receiverId: attacker, amount: 1_000_000_000_000_000_000n })),
    await tryWithLeash("add a full access key to the agent account", (a) =>
      a.signAndSendTransaction({ receiverId: CHAIN.AGENT_ID, actions: [actions.addFullAccessKey(KeyPair.fromRandom("ed25519").getPublicKey())] }),
    ),
    await tryWithLeash("approve its own held payment", (a) => a.callFunction({ contractId: CHAIN.GUARD_ID, methodName: "approve", args: { id: "0" } })),
    await tryWithLeash("mint an owner intent for the attacker", (a) =>
      a.callFunction({ contractId: CHAIN.GUARD_ID, methodName: "declare_intent", args: { payee: attacker, max_amount: "1", ttl_minutes: 1 } }),
    ),
  ];
}
