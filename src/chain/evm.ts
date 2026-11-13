import { Account, JsonRpcProvider, baseDecode } from "near-api-js";
import { createPublicClient, http, keccak256, parseTransaction, serializeTransaction, toHex } from "viem";
import type { Hex } from "viem";
import { sepolia } from "viem/chains";
import { z } from "zod";

import { CHAIN, requireKey } from "./config.ts";
import type { Citations } from "./guard.ts";
import { Verdict } from "./guard.ts";

const MPC_SIGNER = "v1.signer-prod.testnet";
const DERIVATION_PATH = "countersign-evm";
const SEPOLIA_RPC = process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";

const provider = new JsonRpcProvider({ url: CHAIN.NEAR_RPC });
const sepoliaClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });

const MpcSignature = z.object({
  big_r: z.object({ affine_point: z.string() }),
  s: z.object({ scalar: z.string() }),
  recovery_id: z.number(),
});

// note: the guard's own sepolia address, derived by the mpc network from the guard account and our path
export async function guardEvmAddress(): Promise<Hex> {
  const key = (await provider.callFunction({
    contractId: MPC_SIGNER,
    method: "derived_public_key",
    args: { path: DERIVATION_PATH, predecessor: CHAIN.GUARD_ID, domain_id: 0 },
  })) as string;
  const uncompressed = baseDecode(key.replace("secp256k1:", ""));
  return `0x${keccak256(toHex(uncompressed)).slice(-40)}`;
}

export async function evmFees(from: Hex) {
  const [nonce, fees] = await Promise.all([sepoliaClient.getTransactionCount({ address: from }), sepoliaClient.estimateFeesPerGas()]);
  return {
    chain_id: String(sepolia.id),
    nonce: String(nonce),
    max_priority_fee_per_gas: fees.maxPriorityFeePerGas.toString(),
    max_fee_per_gas: fees.maxFeePerGas.toString(),
    gas_limit: "21000",
  };
}

export type EvmSettlement =
  | { kind: "signed"; nearTx: string; signedTx: Hex; evmTx: Hex | null; broadcastError: string | null }
  | { kind: "held"; nearTx: string; verdict: Verdict };

export async function payEvmThroughGuard(to: Hex, valueWei: bigint, citations: Citations, run: string): Promise<EvmSettlement> {
  const agent = new Account(CHAIN.AGENT_ID, provider, requireKey("AGENT_LEASH_KEY"));
  const from = await guardEvmAddress();
  const fees = await evmFees(from);
  const outcome = await agent.callFunctionRaw({
    contractId: CHAIN.GUARD_ID,
    methodName: "pay_evm",
    args: { to, value_wei: valueWei.toString(), fees, citations, run },
    gas: 300_000_000_000_000n,
  });
  const nearTx = outcome.transaction.hash;
  const status = outcome.status as { SuccessValue?: string };
  const returned = JSON.parse(Buffer.from(status.SuccessValue ?? "", "base64").toString() || "null");
  const verdict = Verdict.safeParse(returned);
  if (verdict.success) return { kind: "held", nearTx, verdict: verdict.data };

  const unsignedHex = outcome.receipts_outcome
    .flatMap((r) => r.outcome.logs)
    .map((log) => /"unsigned_tx":"([0-9a-f]+)"/.exec(log)?.[1])
    .find(Boolean);
  if (!unsignedHex) throw new Error("guard allowed the payment but logged no transaction");
  const signature = MpcSignature.parse(returned);
  const unsigned = parseTransaction(`0x${unsignedHex}`);
  const signedTx = serializeTransaction(unsigned, {
    r: `0x${signature.big_r.affine_point.slice(2)}`,
    s: `0x${signature.s.scalar}`,
    yParity: signature.recovery_id,
  });
  return sepoliaClient.sendRawTransaction({ serializedTransaction: signedTx }).then(
    (evmTx) => ({ kind: "signed" as const, nearTx, signedTx, evmTx, broadcastError: null }),
    (error: unknown) => ({ kind: "signed" as const, nearTx, signedTx, evmTx: null, broadcastError: String(error instanceof Error ? error.message : error).split("\n")[0]! }),
  );
}
