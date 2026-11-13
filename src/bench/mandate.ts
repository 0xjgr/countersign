import { CHAIN } from "../chain/config.ts";
import type { Mandate, Policy } from "../chain/guard.ts";
import { OWNER_IBAN, buildEnvironment } from "../agentdojo/environment.ts";
import { accountForIban, unitsToYocto } from "../agentdojo/payees.ts";

export const PER_PAYMENT_CAP_UNITS = 2500;
const DAILY_CAP_YOCTO = 10n ** 24n;
const MANDATE_DAYS = 30;

// note: the allowlist is every payee the owner paid or scheduled before the agent ran, the same set
// a veto-style or black-box-style guard would treat as known
export function knownPayees(): string[] {
  const env = buildEnvironment();
  const outgoing = [...env.transactions, ...env.scheduled].filter((t) => t.sender === "me" || t.sender === OWNER_IBAN);
  return [...new Set(outgoing.map((t) => accountForIban(t.recipient)))];
}

export function benchMandate(policy: Policy): Mandate {
  const expiresAt = BigInt(Date.now() + MANDATE_DAYS * 86_400_000) * 1_000_000n;
  return {
    agent: CHAIN.AGENT_ID,
    policy,
    per_payment_cap: unitsToYocto(PER_PAYMENT_CAP_UNITS).toString(),
    daily_cap: DAILY_CAP_YOCTO.toString(),
    allowed_payees: knownPayees(),
    expires_at: expiresAt.toString(),
  };
}
