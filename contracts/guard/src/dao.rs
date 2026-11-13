use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::json;
use near_sdk::{AccountId, Gas, NearToken, Promise, env, near};

use crate::mandate::Proposal;

const APPROVE_GAS: Gas = Gas::from_tgas(30);
const PROPOSE_GAS: Gas = Gas::from_tgas(20);

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Dao {
    pub account: AccountId,
    // note: sputnik charges this per proposal and refunds it once the proposal is decided
    pub bond: NearToken,
}

// note: an ask becomes a sputnik proposal whose only action is guard.approve(id)
pub fn propose_approval(dao: &Dao, id: u64, proposal: &Proposal) {
    let approve_args = json!({ "id": U64(id) }).to_string().into_bytes();
    let description = format!(
        "countersign proposal {id}: pay {} yocto to {} (payee cited from {})",
        proposal.amount.as_yoctonear(),
        proposal.payee,
        proposal.citations.payee,
    );
    let args = json!({
        "proposal": {
            "description": description,
            "kind": { "FunctionCall": {
                "receiver_id": env::current_account_id(),
                "actions": [{
                    "method_name": "approve",
                    "args": Base64VecU8::from(approve_args),
                    "deposit": "0",
                    "gas": U64(APPROVE_GAS.as_gas()),
                }],
            }},
        }
    });
    Promise::new(dao.account.clone())
        .function_call("add_proposal", args.to_string().into_bytes(), dao.bond, PROPOSE_GAS)
        .detach();
}
