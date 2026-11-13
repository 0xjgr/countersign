use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::json;
use near_sdk::{Gas, NearToken, Promise, env, near};

use crate::rlp::{encode_bytes, encode_list, encode_uint};

pub const MPC_SIGNER: &str = "v1.signer-prod.testnet";
pub const DERIVATION_PATH: &str = "countersign-evm";
const SIGN_GAS: Gas = Gas::from_tgas(50);

// note: gas fields come from the agent, they cannot redirect funds; to and value come from the judged proposal
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct EvmFees {
    pub chain_id: U64,
    pub nonce: U64,
    pub max_priority_fee_per_gas: U128,
    pub max_fee_per_gas: U128,
    pub gas_limit: U64,
}

pub fn parse_address(to: &str) -> Option<[u8; 20]> {
    let hex = to.strip_prefix("0x")?;
    if hex.len() != 40 {
        return None;
    }
    let mut out = [0u8; 20];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[2 * i..2 * i + 2], 16).ok()?;
    }
    Some(out)
}

pub fn unsigned_eip1559(to: &[u8; 20], value_wei: u128, fees: &EvmFees) -> Vec<u8> {
    let fields = [
        encode_uint(u128::from(fees.chain_id.0)),
        encode_uint(u128::from(fees.nonce.0)),
        encode_uint(fees.max_priority_fee_per_gas.0),
        encode_uint(fees.max_fee_per_gas.0),
        encode_uint(u128::from(fees.gas_limit.0)),
        encode_bytes(to),
        encode_uint(value_wei),
        encode_bytes(&[]),
        encode_list(&[]),
    ];
    let mut tx = vec![0x02];
    tx.extend(encode_list(&fields));
    tx
}

pub fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

// threat: the agent asks the mpc network to sign a different transaction than the one the guard allowed
pub fn request_signature(unsigned_tx: &[u8]) -> Promise {
    let hash = env::keccak256(unsigned_tx);
    let args = json!({
        "request": {
            "path": DERIVATION_PATH,
            "payload_v2": { "Ecdsa": to_hex(&hash) },
            "domain_id": 0,
        }
    });
    Promise::new(MPC_SIGNER.parse().unwrap()).function_call("sign", args.to_string().into_bytes(), NearToken::from_yoctonear(1), SIGN_GAS)
}
