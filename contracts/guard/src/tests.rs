use near_sdk::json_types::U64;
use near_sdk::test_utils::{VMContextBuilder, accounts, get_logs};
use near_sdk::{NearToken, testing_env};

use crate::{Citations, Guard, Mandate, Policy, Rule, Verdict};

const DAY_MS: u64 = 86_400_000;

fn near(milli: u128) -> NearToken {
    NearToken::from_millinear(milli)
}

fn mandate(policy: Policy) -> Mandate {
    Mandate {
        agent: accounts(1),
        policy,
        per_payment_cap: near(500),
        daily_cap: near(1000),
        allowed_payees: vec![accounts(3), "0x00000000000000000000000000000000000000aa".parse().unwrap()],
        evm_per_payment_cap_wei: near_sdk::json_types::U128(1_000_000_000_000_000),
        expires_at: U64(10 * DAY_MS * 1_000_000),
    }
}

fn act_as(who: usize, now_ms: u64) {
    let context = VMContextBuilder::new()
        .predecessor_account_id(accounts(who))
        .block_timestamp(now_ms * 1_000_000)
        .account_balance(NearToken::from_near(10))
        .build();
    testing_env!(context);
}

fn cite(payee: &str) -> Citations {
    Citations { payee: payee.into(), amount: "seg-0".into() }
}

fn guard(policy: Policy) -> Guard {
    act_as(0, 1000);
    Guard::new(accounts(0), mandate(policy))
}

#[test]
fn owner_intent_allows_new_payee() {
    let mut g = guard(Policy::Provenance);
    let id = g.declare_intent(accounts(4), near(200), 10);
    act_as(1, 2000);
    let verdict = g.pay(accounts(4), near(100), cite(&format!("owner:{}", id.0)), None);
    assert_eq!(verdict, Verdict::Allow);
    assert_eq!(g.get_spent_today(), near(100));
    assert!(get_logs().iter().any(|l| l.contains("\"event\":\"verdict\"")));
}

#[test]
fn owner_intent_is_single_use() {
    let mut g = guard(Policy::Provenance);
    let id = g.declare_intent(accounts(4), near(200), 10);
    act_as(1, 2000);
    let citation = cite(&format!("owner:{}", id.0));
    g.pay(accounts(4), near(100), citation.clone(), None);
    let replay = g.pay(accounts(4), near(100), citation, None);
    assert_eq!(replay, Verdict::Deny { rule: Rule::ForgedCitation });
}

#[test]
fn forged_owner_citation_is_denied() {
    let mut g = guard(Policy::Provenance);
    let id = g.declare_intent(accounts(4), near(200), 10);
    act_as(1, 2000);
    let verdict = g.pay(accounts(5), near(100), cite(&format!("owner:{}", id.0)), None);
    assert_eq!(verdict, Verdict::Deny { rule: Rule::ForgedCitation });
    let invented = g.pay(accounts(5), near(100), cite("owner:99"), None);
    assert_eq!(invented, Verdict::Deny { rule: Rule::ForgedCitation });
}

#[test]
fn intent_cannot_raise_amount_or_outlive_ttl() {
    let mut g = guard(Policy::Provenance);
    let id = g.declare_intent(accounts(4), near(200), 1);
    let citation = cite(&format!("owner:{}", id.0));
    act_as(1, 2000);
    assert_eq!(g.pay(accounts(4), near(300), citation.clone(), None), Verdict::Deny { rule: Rule::ForgedCitation });
    act_as(1, 1000 + 61_000);
    assert_eq!(g.pay(accounts(4), near(100), citation, None), Verdict::Deny { rule: Rule::ForgedCitation });
}

#[test]
fn untrusted_payee_asks_even_when_allowed() {
    let mut g = guard(Policy::Provenance);
    act_as(1, 2000);
    let verdict = g.pay(accounts(3), near(100), cite("seg-2"), None);
    assert_eq!(verdict, Verdict::Ask { rule: Rule::PayeeFromUntrusted });
    assert_eq!(g.get_pending().len(), 1);
    assert_eq!(g.get_spent_today(), near(0));
}

#[test]
fn uncited_payee_is_denied() {
    let mut g = guard(Policy::Provenance);
    act_as(1, 2000);
    assert_eq!(g.pay(accounts(3), near(100), cite("trust me"), None), Verdict::Deny { rule: Rule::Uncited });
}

#[test]
fn allowlist_policy_ignores_origin() {
    let mut g = guard(Policy::Allowlist);
    act_as(1, 2000);
    assert_eq!(g.pay(accounts(3), near(100), cite("seg-2"), None), Verdict::Allow);
    assert_eq!(g.pay(accounts(4), near(100), cite("seg-2"), None), Verdict::Deny { rule: Rule::PayeeNotAllowed });
}

#[test]
fn unknown_to_human_policy_asks_for_new_payees() {
    let mut g = guard(Policy::UnknownToHuman);
    act_as(1, 2000);
    assert_eq!(g.pay(accounts(3), near(100), cite("seg-2"), None), Verdict::Allow);
    assert_eq!(g.pay(accounts(4), near(100), cite("seg-2"), None), Verdict::Ask { rule: Rule::PayeeUnknown });
}

#[test]
fn caps_hold_under_every_policy() {
    let mut g = guard(Policy::Allowlist);
    act_as(1, 2000);
    assert_eq!(g.pay(accounts(3), near(600), cite("seg-0"), None), Verdict::Deny { rule: Rule::OverPaymentCap });
    g.pay(accounts(3), near(500), cite("seg-0"), None);
    g.pay(accounts(3), near(400), cite("seg-0"), None);
    assert_eq!(g.pay(accounts(3), near(200), cite("seg-0"), None), Verdict::Deny { rule: Rule::OverDailyCap });
    act_as(1, 2000 + DAY_MS);
    assert_eq!(g.pay(accounts(3), near(200), cite("seg-0"), None), Verdict::Allow);
}

#[test]
fn expired_mandate_denies() {
    let mut g = guard(Policy::Allowlist);
    act_as(1, 11 * DAY_MS);
    assert_eq!(g.pay(accounts(3), near(100), cite("seg-0"), None), Verdict::Deny { rule: Rule::MandateExpired });
}

#[test]
#[should_panic(expected = "only the agent can pay")]
fn only_agent_can_pay() {
    let mut g = guard(Policy::Allowlist);
    act_as(5, 2000);
    g.pay(accounts(3), near(100), cite("seg-0"), None);
}

#[test]
#[should_panic(expected = "only the owner")]
fn agent_cannot_declare_intent() {
    let mut g = guard(Policy::Provenance);
    act_as(1, 2000);
    g.declare_intent(accounts(5), near(100), 10);
}

#[test]
fn approval_settles_and_rechecks_caps() {
    let mut g = guard(Policy::Provenance);
    act_as(1, 2000);
    g.pay(accounts(4), near(500), cite("seg-1"), None);
    g.pay(accounts(4), near(500), cite("seg-1"), None);
    g.pay(accounts(4), near(500), cite("seg-1"), None);
    act_as(0, 3000);
    assert_eq!(g.approve(U64(0)), Verdict::Allow);
    assert_eq!(g.approve(U64(1)), Verdict::Allow);
    assert_eq!(g.approve(U64(2)), Verdict::Deny { rule: Rule::OverDailyCap });
    assert!(g.get_pending().is_empty());
}

#[test]
#[should_panic(expected = "only the owner or its dao")]
fn agent_cannot_approve_itself() {
    let mut g = guard(Policy::Provenance);
    act_as(1, 2000);
    g.pay(accounts(4), near(100), cite("seg-1"), None);
    g.approve(U64(0));
}

#[test]
fn standing_citation_needs_an_allowed_payee() {
    let mut g = guard(Policy::Provenance);
    act_as(1, 2000);
    assert_eq!(g.pay(accounts(3), near(100), cite("owner:allowlist"), None), Verdict::Allow);
    assert_eq!(g.pay(accounts(5), near(100), cite("owner:allowlist"), None), Verdict::Deny { rule: Rule::ForgedCitation });
}

fn fees() -> crate::EvmFees {
    use near_sdk::json_types::U128;
    crate::EvmFees { chain_id: U64(11155111), nonce: U64(0), max_priority_fee_per_gas: U128(1), max_fee_per_gas: U128(2), gas_limit: U64(21000) }
}

#[test]
fn evm_payment_from_untrusted_text_is_not_signed() {
    let mut g = guard(Policy::Provenance);
    act_as(1, 2000);
    let outcome = g.pay_evm("0x00000000000000000000000000000000000000BB".into(), near_sdk::json_types::U128(10), fees(), cite("seg-1"), None);
    assert!(matches!(outcome, near_sdk::PromiseOrValue::Value(Verdict::Ask { rule: Rule::PayeeFromUntrusted })));
}

#[test]
fn evm_payment_over_its_cap_is_denied() {
    let mut g = guard(Policy::Provenance);
    act_as(1, 2000);
    let outcome = g.pay_evm("0x00000000000000000000000000000000000000aa".into(), near_sdk::json_types::U128(10u128.pow(18)), fees(), cite("owner:allowlist"), None);
    assert!(matches!(outcome, near_sdk::PromiseOrValue::Value(Verdict::Deny { rule: Rule::OverPaymentCap })));
}

#[test]
fn allowed_evm_payment_goes_to_the_mpc_signer() {
    let mut g = guard(Policy::Provenance);
    act_as(1, 2000);
    let outcome = g.pay_evm("0x00000000000000000000000000000000000000AA".into(), near_sdk::json_types::U128(10), fees(), cite("owner:allowlist"), None);
    assert!(matches!(outcome, near_sdk::PromiseOrValue::Promise(_)));
    assert!(get_logs().iter().any(|l| l.contains("\"unsigned_tx\":\"02")));
}
