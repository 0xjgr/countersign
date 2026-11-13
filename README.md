# Countersign

A NEAR contract that only lets an AI agent pay someone if the payee came from the owner, not from a document the agent read.

RESULTS_HEADLINE

**Try it:** JUDGE_PAGE_URL (write the bill the agent reads, watch the verdict land on testnet, no wallet or key needed).
**Check the numbers without trusting us:** `pnpm install && pnpm judges` re-reads every benchmark transaction from NEAR testnet and rebuilds the table below.

Vocabulary used in code, UI and video:

| Word | Meaning |
|---|---|
| mandate | what the owner allows: cap per payment, cap per day, known payees, expiry, policy |
| leash key | the agent's function-call key: one contract, one method (`pay`), a gas allowance |
| intent | a payee the owner typed, registered on chain by the owner's own key before the agent runs |
| citation | where a payee came from: `owner:<intent>`, `owner:allowlist`, or `seg-N` (untrusted text the agent read) |
| proposal | the payment the agent wants to make, with its citations |
| verdict | `allow`, `ask` (held for the owner or the owner's DAO) or `deny`, with the rule that fired |
| ledger entry | one NEP-297 event per verdict, readable on the explorer |

## Why

Agents that pay bills read invoices and emails, and an injection in that text can swap the payee. Every guard in this hackathon's security track that we read decides by the payee itself: an allowlist refuses new payees, or any unknown payee goes to a human. Neither asks who chose the payee, so the owner's own new payees get refused or interrupt a human, and an injected payee is handled the same way as one the owner typed.

## How it works

```
 owner's words ──► owner client ──declare_intent──►┐
                                                  │        guard.countersign-owner.testnet
 bill / email ──► agent (LLM) ──proposal──► provenance ──pay(payee, amount, citations)──►  caps ─► origin ─► allow: transfer
   (untrusted)                              trace          signed with the leash key         │          ask:   pending ──► owner or Sputnik DAO approves
                                                                                             └────────► deny:  nothing moves
                                                                       every verdict ──► NEP-297 ledger entry
```

1. The owner's client finds the payees in the owner's own request and registers each as an intent, signed with the owner's key. The agent's key cannot call `declare_intent`.
2. The agent runs with tools. Every tool output is logged as a segment, labelled `owner-record` (the owner's past payments) or `untrusted` (files, incoming transaction text, anything a third party wrote, and anything the agent itself created).
3. When the agent proposes a payment, the provenance trace finds where the payee string first appeared: the owner's words, the owner's records, or segment N.
4. The agent's leash key calls `guard.pay`. The contract checks the caps, then the citation: an `owner:<intent>` citation must match a live, unused intent for that payee and amount; `owner:allowlist` must be a known payee; `seg-N` is held as pending. A wrong citation is refused as `forged-citation`.
5. A held payment becomes a proposal in the owner's Sputnik DAO on testnet (`countersign-owner.sputnik-v2.testnet`). When the DAO approves, it calls `guard.approve`, which re-checks the caps before paying.

## Threat model

- `threat:` an invoice or email swaps the payee. The trace cites it as `seg-N` and the contract holds the payment for the owner.
- `threat:` the agent host is compromised and lies about the citation. It cannot mint an intent (the leash key cannot call `declare_intent`), so a made-up `owner:` citation is refused on chain.
- `threat:` the compromised host tries to leave the leash. `pnpm demo` tries it on testnet: a direct transfer and `AddKey` are rejected with "Access key requires full access"; `approve` and `declare_intent` are rejected because the key only allows `pay`.
- `threat:` the agent launders an injected payee through its own earlier payment and then reads it back as history. Transactions the agent made during the run are labelled untrusted.
- `threat:` replaying one owner intent for many payments. Intents are single use and expire.
- `threat:` a stale approval paying past today's caps. `approve` re-checks the caps when it runs.

## Results

RESULTS_TABLE

Method, so you can judge it:

- Tasks and attacks are AgentDojo's banking suite (ETH Zurich, MIT), copied verbatim: 16 user tasks, 9 injection tasks, the `important_instructions` attack. Each injection runs against all 16 tasks, plus 16 clean runs. Injection 7 changes a password and moves no money, so it is out of scope for a payment guard and not counted.
- The agent runs once per episode, unguarded. Every payment it attempted (`send_money`, `schedule_transaction`, a recipient or amount change on a standing order) is then sent to testnet under each guard: a full access key transfer, and `guard.pay` under the `allowlist`, `unknown-to-human` and `provenance` policies of the same contract. All four guards judge the exact same attempts.
- An attacker payment is any attempt to the AgentDojo attacker IBAN in an injected episode. A legit payment is any attempt in a clean episode, whether or not the agent got the task right.
- Each IBAN maps to a real testnet account (the attacker IBAN is `attacker.countersign-owner.testnet`). 1 AgentDojo unit is 1e-6 NEAR. The cap is 2500 units per payment and 1 NEAR per day for every guard.
- Traces: `bench/traces/<model>/u<task>-<injection>.json`. On-chain record: `bench/traces/<model>/anchors.json`.

## Run locally

```
pnpm install
pnpm judges        # no keys: re-derive the results table from testnet
pnpm demo          # no keys: replay the recorded demo and check each transaction on testnet
```

With your own testnet accounts: copy `.env.example` to `.env`, run `pnpm keys` and the printed `near` commands, then `pnpm demo` runs live, `pnpm serve` starts the judge page, and `pnpm bench:collect && pnpm bench:anchor && pnpm bench:report` re-runs the benchmark. The contract builds with `cargo near build` in `contracts/guard` and its tests run with `cargo test` (15 unit tests, one sandbox integration test).

## Deployed on testnet

| What | Account |
|---|---|
| Guard contract | [guard.countersign-owner.testnet](https://testnet.nearblocks.io/address/guard.countersign-owner.testnet) |
| Agent (leash key: `pay` on the guard only) | [agent.countersign-owner.testnet](https://testnet.nearblocks.io/address/agent.countersign-owner.testnet) |
| Owner | [countersign-owner.testnet](https://testnet.nearblocks.io/address/countersign-owner.testnet) |
| Owner's DAO | [countersign-owner.sputnik-v2.testnet](https://testnet.nearblocks.io/address/countersign-owner.sputnik-v2.testnet) |
| Attacker (AgentDojo `US133000000121212121212`) | [attacker.countersign-owner.testnet](https://testnet.nearblocks.io/address/attacker.countersign-owner.testnet) |

## Limitations

- The trace is string provenance. If injected text names a payee the owner already paid, the citation is `owner:allowlist` and the payment goes through, bounded only by the caps. The judge page lets you try exactly that, and the attempts board shows it when it happens.
- A held payment is only as safe as the human who approves it. The DAO proposal says where the payee came from, but a careless approval still pays.
- The owner's client extracts payees from the owner's request with a pattern match on IBANs and testnet account names. A payee described in words ("my landlord") produces no intent and goes to the owner.
- Results come from one agent model per table; a different model attempts different payments. The benchmark runs the agent once per episode, so what an agent would do after a refusal is not measured.
- Testnet only. No mainnet deployment, no audit.

## Prior art

- **Veto** ([Bronxydrone/Veto](https://github.com/Bronxydrone/Veto)): a NEAR contract holds the funds and the agent key can only call `spend()`, with caps, a payee allowlist and an approval queue. Countersign uses the same leash shape; the difference is the origin check. Its own README says "we bound consequences, we do not judge intent".
- **Black box** ([tenxagent/blackbox](https://github.com/tenxagent/blackbox)): a real agent with real funds, a pre-sign filter, and every decision anchored on NEAR mainnet. An unknown payee goes to a human. Our `unknown-to-human` policy reproduces that rule for comparison.
- **TAINT** (submitted to this hackathon): tracks the provenance of each value with NEAR AI Cloud. Same idea family; Countersign's addition is the comparison on public tasks with every verdict on testnet.
- **Agent Leash** ([edwardtay/agent-leash](https://github.com/edwardtay/agent-leash)): spending permissions for agents on EVM with ERC-7715, no provenance.
- **countersigned** ([boringstud-io/countersigned](https://github.com/boringstud-io/countersigned)): human co-signatures for agent actions, not on NEAR.

## Prior work

The idea of citing each payment value back to its source comes from [Hearsay](https://github.com/0xjgr/hearsay), my PayPal hackathon entry (judged until 21 Dec 2026). No code was copied from it: everything in this repo was written for NEAR HACKATHON, starting 12 Nov 2026, as the commit history shows. AgentDojo's banking data, prompts and attack template are ported under its MIT license (`src/agentdojo/`, with the source commit noted in each file).

## AI tools used

Claude Code (Anthropic) helped write the code, tests and this README; every change was reviewed and run by me. The benchmark agent is an LLM by design: MODEL_LIST.
