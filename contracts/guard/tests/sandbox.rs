use near_api::{AccountId, NearToken, NetworkConfig, Signer};
use near_sdk::serde_json::{Value, json};
use std::sync::Arc;

struct Chain {
    _sandbox: near_sandbox::Sandbox,
    network: NetworkConfig,
    signer: Arc<Signer>,
}

impl Chain {
    async fn account(&self, sandbox: &near_sandbox::Sandbox, name: &str) -> testresult::TestResult<AccountId> {
        let id: AccountId = name.parse()?;
        sandbox.create_account(id.as_str().parse()?).initial_balance(NearToken::from_near(10)).send().await?;
        Ok(id)
    }

    // note: testresult panics on `?`, so a failing call is returned as a plain error to assert on
    async fn call(&self, guard: &AccountId, from: &AccountId, method: &str, args: Value) -> Result<Value, String> {
        let outcome = near_api::Contract(guard.clone())
            .call_function(method, args)
            .transaction()
            .with_signer(from.clone(), self.signer.clone())
            .send_to(&self.network)
            .await
            .map_err(|e| e.to_string())?;
        let outcome = outcome.into_result().map_err(|e| e.to_string())?;
        Ok(outcome.json().unwrap_or(Value::Null))
    }

    async fn balance(&self, id: &AccountId) -> testresult::TestResult<NearToken> {
        Ok(near_api::Tokens::account(id.clone()).near_balance().fetch_from(&self.network).await?.total)
    }
}

#[tokio::test]
async fn guard_settles_owner_intents_and_holds_untrusted_payees() -> testresult::TestResult<()> {
    let wasm = std::fs::read(cargo_near_build::build_with_cli(Default::default())?)?;
    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let network = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = Signer::from_secret_key(near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
    let chain = Chain { _sandbox: sandbox, network, signer };
    let sandbox = &chain._sandbox;

    let owner = chain.account(sandbox, "owner.sandbox").await?;
    let agent = chain.account(sandbox, "agent.sandbox").await?;
    let vendor = chain.account(sandbox, "vendor.sandbox").await?;
    let attacker = chain.account(sandbox, "attacker.sandbox").await?;
    let guard = chain.account(sandbox, "guard.sandbox").await?;

    let mandate = json!({
        "agent": agent, "policy": "provenance",
        "per_payment_cap": NearToken::from_near(1), "daily_cap": NearToken::from_near(2),
        "allowed_payees": [vendor], "expires_at": "9999999999999999999",
    });
    near_api::Contract::deploy(guard.clone())
        .use_code(wasm)
        .with_init_call("new", json!({ "owner": owner, "mandate": mandate }))?
        .with_signer(chain.signer.clone())
        .send_to(&chain.network)
        .await?
        .assert_success();

    let intent = chain.call(&guard, &owner, "declare_intent",
        json!({ "payee": vendor, "max_amount": NearToken::from_near(1), "ttl_minutes": 10 })).await?;
    let before = chain.balance(&vendor).await?;
    let allowed = chain.call(&guard, &agent, "pay", json!({
        "payee": vendor, "amount": NearToken::from_millinear(500),
        "citations": { "payee": format!("owner:{}", intent.as_str().unwrap()), "amount": "owner:0" },
        "run": "sandbox:owner-intent",
    })).await?;
    assert_eq!(allowed, json!({ "kind": "allow" }));
    assert_eq!(chain.balance(&vendor).await?, before.saturating_add(NearToken::from_millinear(500)));

    let attacker_before = chain.balance(&attacker).await?;
    let held = chain.call(&guard, &agent, "pay", json!({
        "payee": attacker, "amount": NearToken::from_millinear(500),
        "citations": { "payee": "seg-3", "amount": "seg-3" }, "run": null,
    })).await?;
    assert_eq!(held, json!({ "kind": "ask", "rule": "payee-from-untrusted" }));

    let forged = chain.call(&guard, &agent, "pay", json!({
        "payee": attacker, "amount": NearToken::from_millinear(500),
        "citations": { "payee": "owner:0", "amount": "owner:0" }, "run": null,
    })).await?;
    assert_eq!(forged, json!({ "kind": "deny", "rule": "forged-citation" }));
    assert_eq!(chain.balance(&attacker).await?, attacker_before);

    assert!(chain.call(&guard, &agent, "approve", json!({ "id": "0" })).await.is_err());
    chain.call(&guard, &owner, "reject", json!({ "id": "0" })).await?;
    assert_eq!(chain.balance(&attacker).await?, attacker_before);
    Ok(())
}
