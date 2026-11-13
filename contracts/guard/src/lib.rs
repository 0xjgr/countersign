use near_sdk::json_types::U64;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{AccountId, NearToken, PanicOnDefault, Promise, env, near, require};

mod dao;
mod ledger;
mod mandate;
mod verdict;

pub use ledger::LedgerEntry;
pub use mandate::{Citations, Intent, Mandate, PayeeOrigin, Policy, Proposal};
pub use verdict::{Ledger, Rule, Verdict};

const DAY_NS: u64 = 86_400 * 1_000_000_000;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Guard {
    owner: AccountId,
    mandate: Mandate,
    dao: Option<dao::Dao>,
    spent_day: u64,
    spent: NearToken,
    next_intent: u64,
    intents: LookupMap<u64, Intent>,
    next_proposal: u64,
    pending: IterableMap<u64, Proposal>,
}

#[near]
impl Guard {
    #[init]
    pub fn new(owner: AccountId, mandate: Mandate) -> Self {
        Self {
            owner,
            mandate,
            dao: None,
            spent_day: 0,
            spent: NearToken::from_yoctonear(0),
            next_intent: 0,
            intents: LookupMap::new(b"i"),
            next_proposal: 0,
            pending: IterableMap::new(b"p"),
        }
    }

    pub fn set_mandate(&mut self, mandate: Mandate) {
        self.require_owner();
        self.mandate = mandate;
    }

    pub fn set_dao(&mut self, dao: Option<dao::Dao>) {
        self.require_owner();
        self.dao = dao;
    }

    // threat: only the owner's own key can mint an owner citation, the agent key cannot call this
    pub fn declare_intent(&mut self, payee: AccountId, max_amount: NearToken, ttl_minutes: u32) -> U64 {
        self.require_owner();
        let id = self.next_intent;
        self.next_intent += 1;
        let expires_at = U64(env::block_timestamp() + u64::from(ttl_minutes) * 60 * 1_000_000_000);
        self.intents.insert(id, Intent { payee: payee.clone(), max_amount, expires_at });
        LedgerEntry::Intent { intent_id: U64(id), payee, max_amount }.emit();
        U64(id)
    }

    pub fn pay(&mut self, payee: AccountId, amount: NearToken, citations: Citations, run: Option<String>) -> Verdict {
        // threat: anyone but the leashed agent spending the guarded funds
        require!(env::predecessor_account_id() == self.mandate.agent, "only the agent can pay");
        let proposal = Proposal { payee, amount, citations, run };
        let intent_id = match mandate::parse_origin(&proposal.citations.payee) {
            PayeeOrigin::Owner(id) => Some(id),
            _ => None,
        };
        let intent = intent_id.and_then(|id| self.intents.get(&id).cloned());
        let verdict = verdict::judge(&self.mandate, &self.ledger(), &proposal, intent.as_ref());

        let proposal_id = match verdict {
            Verdict::Allow => {
                // threat: replaying one owner intent for many payments
                if let Some(id) = intent_id {
                    self.intents.remove(&id);
                }
                self.settle(&proposal);
                None
            }
            Verdict::Ask { .. } => Some(self.queue(&proposal)),
            Verdict::Deny { .. } => None,
        };
        self.log_verdict(&proposal, proposal_id, verdict);
        verdict
    }

    pub fn approve(&mut self, id: U64) -> Verdict {
        let by = self.require_approver();
        let proposal = self.pending.remove(&id.0).expect("no such proposal");
        // threat: a stale grant spending past the caps that hold today
        let verdict = verdict::judge_caps(&self.mandate, &self.ledger(), proposal.amount);
        if verdict == Verdict::Allow {
            self.settle(&proposal);
        }
        LedgerEntry::Settled { proposal_id: id, approved: true, by, verdict }.emit();
        verdict
    }

    pub fn reject(&mut self, id: U64) {
        let by = self.require_approver();
        self.pending.remove(&id.0).expect("no such proposal");
        let verdict = Verdict::Deny { rule: Rule::PayeeFromUntrusted };
        LedgerEntry::Settled { proposal_id: id, approved: false, by, verdict }.emit();
    }

    pub fn withdraw(&mut self, amount: NearToken) -> Promise {
        self.require_owner();
        Promise::new(self.owner.clone()).transfer(amount)
    }

    pub fn get_mandate(&self) -> Mandate {
        self.mandate.clone()
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn get_dao(&self) -> Option<dao::Dao> {
        self.dao.clone()
    }

    pub fn get_intent(&self, id: U64) -> Option<Intent> {
        self.intents.get(&id.0).cloned()
    }

    pub fn get_pending(&self) -> Vec<(U64, Proposal)> {
        self.pending.iter().map(|(id, p)| (U64(*id), p.clone())).collect()
    }

    pub fn get_spent_today(&self) -> NearToken {
        self.ledger().spent_today
    }
}

impl Guard {
    fn ledger(&self) -> Ledger {
        let now = env::block_timestamp();
        let is_same_day = now / DAY_NS == self.spent_day;
        let spent_today = if is_same_day { self.spent } else { NearToken::from_yoctonear(0) };
        Ledger { now, spent_today }
    }

    fn settle(&mut self, proposal: &Proposal) {
        let ledger = self.ledger();
        self.spent_day = ledger.now / DAY_NS;
        self.spent = ledger.spent_today.saturating_add(proposal.amount);
        // note: spend is booked before the transfer lands, a failed transfer still counts against the cap
        Promise::new(proposal.payee.clone()).transfer(proposal.amount).detach();
    }

    fn queue(&mut self, proposal: &Proposal) -> U64 {
        let id = self.next_proposal;
        self.next_proposal += 1;
        self.pending.insert(id, proposal.clone());
        if let Some(dao) = &self.dao {
            dao::propose_approval(dao, id, proposal);
        }
        U64(id)
    }

    fn log_verdict(&self, proposal: &Proposal, proposal_id: Option<U64>, verdict: Verdict) {
        LedgerEntry::Verdict {
            proposal_id,
            payee: proposal.payee.clone(),
            amount: proposal.amount,
            policy: self.mandate.policy,
            verdict,
            citations: proposal.citations.clone(),
            run: proposal.run.clone(),
        }
        .emit();
    }

    fn require_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "only the owner");
    }

    fn require_approver(&self) -> AccountId {
        let caller = env::predecessor_account_id();
        let is_dao = self.dao.as_ref().is_some_and(|dao| dao.account == caller);
        require!(caller == self.owner || is_dao, "only the owner or its dao");
        caller
    }
}

#[cfg(test)]
mod tests;
