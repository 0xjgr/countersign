import { Account, JsonRpcProvider, getTransactionLastResult } from "near-api-js";
import { z } from "zod";

import { CHAIN, requireKey } from "./config.ts";

export const Rule = z.enum([
  "mandate-expired",
  "over-payment-cap",
  "over-daily-cap",
  "payee-not-allowed",
  "payee-unknown",
  "payee-from-untrusted",
  "forged-citation",
  "uncited",
]);
export type Rule = z.infer<typeof Rule>;

export const Verdict = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allow") }),
  z.object({ kind: z.literal("ask"), rule: Rule }),
  z.object({ kind: z.literal("deny"), rule: Rule }),
]);
export type Verdict = z.infer<typeof Verdict>;

export type Policy = "allowlist" | "unknown-to-human" | "provenance";

export type Mandate = {
  agent: string;
  policy: Policy;
  per_payment_cap: string;
  daily_cap: string;
  allowed_payees: string[];
  evm_per_payment_cap_wei: string;
  expires_at: string;
};

export type Citations = { payee: string; amount: string };

export type Settlement = { txHash: string; verdict: Verdict };

const provider = new JsonRpcProvider({ url: CHAIN.NEAR_RPC });

function owner(): Account {
  return new Account(CHAIN.OWNER_ID, provider, requireKey("OWNER_KEY"));
}

// threat: the agent host only ever holds this key, it can call guard.pay and nothing else
function leashedAgent(): Account {
  return new Account(CHAIN.AGENT_ID, provider, requireKey("AGENT_LEASH_KEY"));
}

export async function payThroughGuard(payee: string, yocto: bigint, citations: Citations, run: string): Promise<Settlement> {
  const outcome = await leashedAgent().callFunctionRaw({
    contractId: CHAIN.GUARD_ID,
    methodName: "pay",
    args: { payee, amount: yocto.toString(), citations, run },
    gas: 60_000_000_000_000n,
  });
  return { txHash: outcome.transaction.hash, verdict: Verdict.parse(getTransactionLastResult(outcome)) };
}

export async function declareIntent(payee: string, maxYocto: bigint, ttlMinutes: number): Promise<{ id: string; txHash: string }> {
  const outcome = await owner().callFunctionRaw({
    contractId: CHAIN.GUARD_ID,
    methodName: "declare_intent",
    args: { payee, max_amount: maxYocto.toString(), ttl_minutes: ttlMinutes },
  });
  return { id: z.string().parse(getTransactionLastResult(outcome)), txHash: outcome.transaction.hash };
}

export async function setMandate(mandate: Mandate): Promise<string> {
  const outcome = await owner().callFunctionRaw({ contractId: CHAIN.GUARD_ID, methodName: "set_mandate", args: { mandate } });
  return outcome.transaction.hash;
}

export async function settlePending(id: string, approve: boolean): Promise<string> {
  const outcome = await owner().callFunctionRaw({
    contractId: CHAIN.GUARD_ID,
    methodName: approve ? "approve" : "reject",
    args: { id },
    gas: 60_000_000_000_000n,
  });
  return outcome.transaction.hash;
}

export async function readMandate(): Promise<Mandate> {
  return provider.callFunction({ contractId: CHAIN.GUARD_ID, method: "get_mandate", args: {} }) as Promise<Mandate>;
}

export async function readPending(): Promise<[string, { payee: string; amount: string; citations: Citations; run: string | null }][]> {
  return provider.callFunction({ contractId: CHAIN.GUARD_ID, method: "get_pending", args: {} }) as never;
}
