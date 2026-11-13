use near_sdk::json_types::U64;
use near_sdk::{AccountId, NearToken, near};

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Policy {
    // note: veto-style, a payee outside the list is refused
    Allowlist,
    // note: black-box-style, a payee outside the list goes to a human
    UnknownToHuman,
    // note: countersign, the payee must trace back to an owner intent
    Provenance,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Mandate {
    pub agent: AccountId,
    pub policy: Policy,
    pub per_payment_cap: NearToken,
    pub daily_cap: NearToken,
    pub allowed_payees: Vec<AccountId>,
    // note: nanoseconds since epoch, same clock as env::block_timestamp
    pub expires_at: U64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Intent {
    pub payee: AccountId,
    pub max_amount: NearToken,
    pub expires_at: U64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Citations {
    // note: "owner:<intent id>", "owner:allowlist" or "seg-<n>" for untrusted text the agent read
    pub payee: String,
    pub amount: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Proposal {
    pub payee: AccountId,
    pub amount: NearToken,
    pub citations: Citations,
    pub run: Option<String>,
}

pub enum PayeeOrigin {
    Owner(u64),
    Standing,
    Untrusted,
    Uncited,
}

pub fn parse_origin(citation: &str) -> PayeeOrigin {
    if citation == "owner:allowlist" {
        return PayeeOrigin::Standing;
    }
    if let Some(id) = citation.strip_prefix("owner:") {
        return match id.parse() {
            Ok(id) => PayeeOrigin::Owner(id),
            Err(_) => PayeeOrigin::Uncited,
        };
    }
    match citation.strip_prefix("seg-") {
        Some(n) if !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()) => PayeeOrigin::Untrusted,
        _ => PayeeOrigin::Uncited,
    }
}
