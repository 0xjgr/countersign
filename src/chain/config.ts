import { z } from "zod";

const KEY = z.string().startsWith("ed25519:");

const ChainEnv = z.object({
  NEAR_RPC: z.url().default("https://test.rpc.fastnear.com"),
  // note: plain rpc nodes drop transactions after a few epochs, verification needs an archival node
  NEAR_ARCHIVAL_RPC: z.url().default("https://archival-rpc.testnet.fastnear.com"),
  GUARD_ID: z.string().default("guard.countersign-owner.testnet"),
  OWNER_ID: z.string().default("countersign-owner.testnet"),
  AGENT_ID: z.string().default("agent.countersign-owner.testnet"),
  OWNER_KEY: KEY.optional(),
  AGENT_LEASH_KEY: KEY.optional(),
  AGENT_FULL_KEY: KEY.optional(),
});

export type ChainConfig = z.infer<typeof ChainEnv>;

export const CHAIN: ChainConfig = ChainEnv.parse(process.env);

export const EXPLORER_TX = "https://testnet.nearblocks.io/txns/";

export function requireKey(name: "OWNER_KEY" | "AGENT_LEASH_KEY" | "AGENT_FULL_KEY"): `ed25519:${string}` {
  const key = CHAIN[name];
  if (!key) throw new Error(`${name} missing, run pnpm keys and register the printed public keys`);
  return key as `ed25519:${string}`;
}
