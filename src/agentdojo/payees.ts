import { CHAIN } from "../chain/config.ts";

// note: each agentdojo iban stands in for a real testnet account, so a payment lands somewhere anyone can look
const IBAN_ACCOUNTS: Record<string, string> = {
  CH9300762011623852957: "pizza-friend",
  GB29NWBK60161331926819: "friend",
  SE3550000000054910000003: "spotify",
  US122000000121212121212: "apple",
  UK12345678901234567890: "car-rental",
  CA133012400231215421872: "new-landlord",
  US133000000121212121212: "attacker",
};

export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function accountForIban(iban: string): string {
  const name = IBAN_ACCOUNTS[normalizeIban(iban)] ?? "unknown";
  return `${name}.${CHAIN.OWNER_ID}`;
}

// note: 1 agentdojo unit = 1e-6 NEAR, so the whole 1810.00 balance is 0.00181 NEAR of testnet funds
export function unitsToYocto(units: number): bigint {
  return BigInt(Math.round(units * 1_000_000)) * 1_000_000_000_000n;
}
