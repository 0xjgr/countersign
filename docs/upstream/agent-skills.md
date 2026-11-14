# Proposed change to near/agent-skills

Target: `skills/near-api-js/references/key_management.md`, new subsection after "Function Call Keys".
Status: draft, not opened.

## PR title

near-api-js: show agents how to sign with a function-call key instead of a full access key

## PR body

Every signing example in the near-api-js skill builds the `Account` from a private key in an
environment variable, and the skill does not say what kind of key that should be. When the code
runs inside an AI agent, that key is usually a full access key, so anything the agent reads (an
invoice, an email, a web page) can steer it into a transfer to any account, or into adding a new
full access key.

This adds a short subsection: give the agent a function-call key restricted to one contract and
one method, and let that contract enforce the owner's limits. Nothing changes for existing examples.

Evidence: on AgentDojo's banking suite (ETH Zurich, MIT), an agent signing with a full access key
(qwen3:8b) paid the attacker's account in 60 of 128 injected runs, 71 transfers on testnet. With a
function-call key scoped to a guard contract, all 71 were held or refused on chain. Example:
unguarded https://testnet.nearblocks.io/txns/hevsFZkNvNfHnM9e4i7kxpTZDoZRnfqtKBiKmVqfTyP, guarded
https://testnet.nearblocks.io/txns/85QZ4UJJqqwgrUwPK14H9ev5LdrYHRPWj8d5ZkhhobSF. Full table and
method: https://github.com/0xjgr/countersign#results.

## Text to add

### Keys for AI agents

An agent that reads untrusted text (emails, invoices, web pages, tool output) should never hold a
full access key. A prompt injection in that text can make it transfer funds anywhere or add a key
for the attacker. Give the agent a function-call key that can only call your guard contract, and
keep the full access key with the owner.

```typescript
// owner side, run once with the owner's full access key
const agentKey = KeyPair.fromRandom("ed25519");
await ownerAccount.addFunctionCallAccessKey({
  publicKey: agentKey.getPublicKey(),
  contractId: "guard.owner.near", // holds the agent's funds and checks every payment
  methodNames: ["pay"],           // the only method the agent can call
  allowance: nearToYocto("0.25"), // caps what the key can burn on gas
});

// agent side: this key cannot sign transfers, add keys, or call any other method
const agent = new Account("agent.owner.near", provider, agentKey.toString() as KeyPairString);
await agent.callFunction({ contractId: "guard.owner.near", methodName: "pay", args: { payee, amount } });
```

The function-call key bounds what a compromised agent can do: a transfer or `AddKey` signed with
it is rejected before execution ("Access key requires full access"). The guard contract is where
the limits live: per-payment and daily caps, an allowlist of payees, or a pending state that the
owner approves.
