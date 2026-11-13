use near_sdk::{NearToken, near};

use crate::mandate::{Intent, Mandate, PayeeOrigin, Policy, Proposal, parse_origin};

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Rule {
    MandateExpired,
    OverPaymentCap,
    OverDailyCap,
    PayeeNotAllowed,
    PayeeUnknown,
    PayeeFromUntrusted,
    ForgedCitation,
    Uncited,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Verdict {
    Allow,
    Ask { rule: Rule },
    Deny { rule: Rule },
}

pub struct Ledger {
    pub now: u64,
    pub spent_today: NearToken,
}

// note: also run at approval time, a grant never lifts the caps
pub fn judge_caps(mandate: &Mandate, ledger: &Ledger, amount: NearToken) -> Verdict {
    if ledger.now >= mandate.expires_at.0 {
        return Verdict::Deny { rule: Rule::MandateExpired };
    }
    if amount > mandate.per_payment_cap {
        return Verdict::Deny { rule: Rule::OverPaymentCap };
    }
    if ledger.spent_today.saturating_add(amount) > mandate.daily_cap {
        return Verdict::Deny { rule: Rule::OverDailyCap };
    }
    Verdict::Allow
}

pub fn judge(mandate: &Mandate, ledger: &Ledger, proposal: &Proposal, intent: Option<&Intent>) -> Verdict {
    let caps = judge_caps(mandate, ledger, proposal.amount);
    if caps != Verdict::Allow {
        return caps;
    }

    let is_allowed = mandate.allowed_payees.contains(&proposal.payee);
    match mandate.policy {
        Policy::Allowlist if is_allowed => Verdict::Allow,
        Policy::Allowlist => Verdict::Deny { rule: Rule::PayeeNotAllowed },
        Policy::UnknownToHuman if is_allowed => Verdict::Allow,
        Policy::UnknownToHuman => Verdict::Ask { rule: Rule::PayeeUnknown },
        Policy::Provenance => judge_origin(ledger, proposal, intent, is_allowed),
    }
}

fn judge_origin(ledger: &Ledger, proposal: &Proposal, intent: Option<&Intent>, is_allowed: bool) -> Verdict {
    match parse_origin(&proposal.citations.payee) {
        // threat: a compromised agent host claims the owner chose an attacker payee
        PayeeOrigin::Owner(_) => match intent {
            Some(intent)
                if intent.payee == proposal.payee
                    && proposal.amount <= intent.max_amount
                    && ledger.now < intent.expires_at.0 =>
            {
                Verdict::Allow
            }
            _ => Verdict::Deny { rule: Rule::ForgedCitation },
        },
        // note: a payee the owner registered before, read back from the owner's own records
        PayeeOrigin::Standing if is_allowed => Verdict::Allow,
        PayeeOrigin::Standing => Verdict::Deny { rule: Rule::ForgedCitation },
        // threat: an invoice or email the agent read swaps in its own payee
        PayeeOrigin::Untrusted => Verdict::Ask { rule: Rule::PayeeFromUntrusted },
        PayeeOrigin::Uncited => Verdict::Deny { rule: Rule::Uncited },
    }
}
