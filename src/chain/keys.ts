import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { KeyPair } from "near-api-js";

import { CHAIN } from "./config.ts";

const ENV_FILE = ".env";
const present = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";

function mint(name: string): string | undefined {
  if (present.includes(`${name}=`)) return undefined;
  const pair = KeyPair.fromRandom("ed25519");
  appendFileSync(ENV_FILE, `${name}=${pair.toString()}\n`);
  return pair.getPublicKey().toString();
}

const ownerKey = mint("OWNER_KEY");
const leashKey = mint("AGENT_LEASH_KEY");
const fullKey = mint("AGENT_FULL_KEY");

const testnet = "network-config testnet sign-with-legacy-keychain send";
if (ownerKey) {
  console.log(`near account add-key ${CHAIN.OWNER_ID} grant-full-access use-manually-provided-public-key ${ownerKey} ${testnet}`);
}
if (leashKey) {
  console.log(
    `near account add-key ${CHAIN.AGENT_ID} grant-function-call-access --allowance '1 NEAR' ` +
      `--contract-account-id ${CHAIN.GUARD_ID} --function-names pay use-manually-provided-public-key ${leashKey} ${testnet}`,
  );
}
if (fullKey) {
  console.log(`near account add-key ${CHAIN.AGENT_ID} grant-full-access use-manually-provided-public-key ${fullKey} ${testnet}`);
}
