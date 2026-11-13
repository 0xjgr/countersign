use near_sdk::json_types::U64;
use near_sdk::{AccountId, NearToken, near};

use crate::mandate::{Citations, Policy};
use crate::verdict::Verdict;

#[near(event_json(standard = "countersign"))]
pub enum LedgerEntry {
    #[event_version("1.0.0")]
    Verdict {
        proposal_id: Option<U64>,
        payee: AccountId,
        amount: NearToken,
        policy: Policy,
        verdict: Verdict,
        citations: Citations,
        run: Option<String>,
    },
    #[event_version("1.0.0")]
    Settled {
        proposal_id: U64,
        approved: bool,
        by: AccountId,
        verdict: Verdict,
    },
    #[event_version("1.0.0")]
    Intent { intent_id: U64, payee: AccountId, max_amount: NearToken },
}
