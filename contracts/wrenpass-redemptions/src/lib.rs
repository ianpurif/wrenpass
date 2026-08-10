#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, Address,
    Env, String, Vec,
};

const CURRENT_STORAGE_VERSION: u32 = 1;
const MAX_SERIALIZED_TRANSACTION_BYTES: u32 = 16_384;
const MAX_REQUEST_LIFETIME_LEDGERS: u32 = 120;
const MAX_PAGE_SIZE: u32 = 50;
const INSTANCE_TTL_THRESHOLD_LEDGERS: u32 = 250_000;
const INSTANCE_TTL_EXTEND_TO_LEDGERS: u32 = 500_000;
const TEMPORARY_TTL_THRESHOLD_LEDGERS: u32 = 17_000;
const TEMPORARY_TTL_EXTEND_TO_LEDGERS: u32 = 17_280;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidTransaction = 3,
    InvalidExpiration = 4,
    PassNotFound = 5,
    CampaignNotFound = 6,
    PassNotActive = 7,
    Unauthorized = 8,
    CampaignUnavailable = 9,
    PassExpired = 10,
    InvalidPageSize = 11,
    Overflow = 12,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CampaignStatus {
    Draft,
    Active,
    Paused,
    Expired,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PassStatus {
    Active,
    Redeemed,
    Expired,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FinancialRules {
    pub merchant_bps: u32,
    pub reserve_bps: u32,
    pub platform_fee_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PurchaseAmounts {
    pub total: i128,
    pub merchant_release: i128,
    pub protected_reserve: i128,
    pub platform_fee: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PassSnapshot {
    pub id: u64,
    pub campaign_id: u64,
    pub owner: Address,
    pub status: PassStatus,
    pub purchased_at: u64,
    pub purchase_amounts: PurchaseAmounts,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignSnapshot {
    pub id: u64,
    pub merchant: Address,
    pub platform: Address,
    pub payment_asset: Address,
    pub pass_price: i128,
    pub service_value: i128,
    pub max_supply: u32,
    pub sold: u32,
    pub redeemed: u32,
    pub refunded: u32,
    pub merchant_released: i128,
    pub protected_funds: i128,
    pub platform_fees_paid: i128,
    pub cancellation_shortfall: i128,
    pub cancellation_funds: i128,
    pub expires_at: u64,
    pub financial_rules: FinancialRules,
    pub status: CampaignStatus,
    pub created_at: u64,
}

#[contractclient(name = "WrenPassCampaignClient")]
pub trait WrenPassCampaign {
    fn get_campaign(env: Env, campaign_id: u64) -> Option<CampaignSnapshot>;
    fn get_pass(env: Env, pass_id: u64) -> Option<PassSnapshot>;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegistryConfig {
    pub campaign_contract: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RedemptionRequest {
    pub campaign_id: u64,
    pub created_at: u64,
    pub expires_at_ledger: u32,
    pub merchant: Address,
    pub owner: Address,
    pub pass_id: u64,
    pub serialized_transaction: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RequestPage {
    pub next_cursor: u64,
    pub requests: Vec<RedemptionRequest>,
}

#[contracttype]
enum DataKey {
    Config,
    StorageVersion,
    Request(u64),
    OwnerRequestCount(Address),
    OwnerRequest(Address, u64),
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contractevent(topics = ["redemption_requested"])]
pub struct RedemptionRequested {
    #[topic]
    pub pass_id: u64,
    #[topic]
    pub merchant: Address,
    #[topic]
    pub owner: Address,
    pub campaign_id: u64,
    pub expires_at_ledger: u32,
}

#[contract]
pub struct WrenPassRedemptionsContract;

#[contractimpl]
impl WrenPassRedemptionsContract {
    pub fn initialize(
        env: Env,
        initializer: Address,
        campaign_contract: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        initializer.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Config, &RegistryConfig { campaign_contract });
        env.storage()
            .instance()
            .set(&DataKey::StorageVersion, &CURRENT_STORAGE_VERSION);
        Self::extend_instance_ttl(&env);
        Ok(())
    }

    pub fn get_config(env: Env) -> Result<RegistryConfig, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    pub fn storage_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::StorageVersion)
            .unwrap_or(0)
    }

    pub fn create_request(
        env: Env,
        merchant: Address,
        owner: Address,
        pass_id: u64,
        serialized_transaction: String,
        expires_at_ledger: u32,
    ) -> Result<RedemptionRequest, Error> {
        if serialized_transaction.is_empty()
            || serialized_transaction.len() > MAX_SERIALIZED_TRANSACTION_BYTES
        {
            return Err(Error::InvalidTransaction);
        }
        let current_ledger = env.ledger().sequence();
        if expires_at_ledger <= current_ledger
            || expires_at_ledger
                > current_ledger
                    .checked_add(MAX_REQUEST_LIFETIME_LEDGERS)
                    .ok_or(Error::Overflow)?
        {
            return Err(Error::InvalidExpiration);
        }

        let config = Self::get_config(env.clone())?;
        let campaign_client = WrenPassCampaignClient::new(&env, &config.campaign_contract);
        let pass = campaign_client
            .get_pass(&pass_id)
            .ok_or(Error::PassNotFound)?;
        if pass.status != PassStatus::Active {
            return Err(Error::PassNotActive);
        }
        if pass.owner != owner {
            return Err(Error::Unauthorized);
        }
        let campaign = campaign_client
            .get_campaign(&pass.campaign_id)
            .ok_or(Error::CampaignNotFound)?;
        if campaign.merchant != merchant {
            return Err(Error::Unauthorized);
        }
        if campaign.expires_at <= env.ledger().timestamp() {
            return Err(Error::PassExpired);
        }
        if campaign.status != CampaignStatus::Active && campaign.status != CampaignStatus::Paused {
            return Err(Error::CampaignUnavailable);
        }

        merchant.require_auth();

        let request_key = DataKey::Request(pass_id);
        let previous: Option<RedemptionRequest> = env.storage().temporary().get(&request_key);
        if previous.as_ref().map(|request| &request.owner) != Some(&owner) {
            Self::append_owner_request(&env, &owner, pass_id)?;
        }

        let request = RedemptionRequest {
            campaign_id: pass.campaign_id,
            created_at: env.ledger().timestamp(),
            expires_at_ledger,
            merchant: merchant.clone(),
            owner: owner.clone(),
            pass_id,
            serialized_transaction,
        };
        env.storage().temporary().set(&request_key, &request);
        Self::extend_temporary_ttl(&env, &request_key);
        Self::extend_instance_ttl(&env);

        RedemptionRequested {
            pass_id,
            merchant,
            owner,
            campaign_id: request.campaign_id,
            expires_at_ledger,
        }
        .publish(&env);

        Ok(request)
    }

    pub fn get_request(env: Env, pass_id: u64) -> Option<RedemptionRequest> {
        let request: RedemptionRequest =
            env.storage().temporary().get(&DataKey::Request(pass_id))?;
        (request.expires_at_ledger > env.ledger().sequence()).then_some(request)
    }

    pub fn owner_request_count(env: Env, owner: Address) -> u64 {
        env.storage()
            .temporary()
            .get(&DataKey::OwnerRequestCount(owner))
            .unwrap_or(0)
    }

    pub fn get_owner_requests(
        env: Env,
        owner: Address,
        cursor: u64,
        limit: u32,
    ) -> Result<RequestPage, Error> {
        if limit == 0 || limit > MAX_PAGE_SIZE {
            return Err(Error::InvalidPageSize);
        }
        let count = Self::owner_request_count(env.clone(), owner.clone());
        let mut next_cursor = core::cmp::min(cursor, count);
        let mut requests = Vec::new(&env);

        while next_cursor < count && requests.len() < limit {
            let pass_key = DataKey::OwnerRequest(owner.clone(), next_cursor);
            if let Some(pass_id) = env.storage().temporary().get::<_, u64>(&pass_key) {
                if let Some(request) = Self::get_request(env.clone(), pass_id) {
                    if request.owner == owner {
                        requests.push_back(request);
                    }
                }
            }
            next_cursor += 1;
        }

        Ok(RequestPage {
            next_cursor,
            requests,
        })
    }

    fn append_owner_request(env: &Env, owner: &Address, pass_id: u64) -> Result<(), Error> {
        let count_key = DataKey::OwnerRequestCount(owner.clone());
        let count: u64 = env.storage().temporary().get(&count_key).unwrap_or(0);
        let next_count = count.checked_add(1).ok_or(Error::Overflow)?;
        let index_key = DataKey::OwnerRequest(owner.clone(), count);
        env.storage().temporary().set(&index_key, &pass_id);
        env.storage().temporary().set(&count_key, &next_count);
        Self::extend_temporary_ttl(env, &index_key);
        Self::extend_temporary_ttl(env, &count_key);
        Ok(())
    }

    fn extend_instance_ttl(env: &Env) {
        env.storage().instance().extend_ttl(
            INSTANCE_TTL_THRESHOLD_LEDGERS,
            INSTANCE_TTL_EXTEND_TO_LEDGERS,
        );
    }

    fn extend_temporary_ttl(env: &Env, key: &DataKey) {
        env.storage().temporary().extend_ttl(
            key,
            TEMPORARY_TTL_THRESHOLD_LEDGERS,
            TEMPORARY_TTL_EXTEND_TO_LEDGERS,
        );
    }
}

#[cfg(test)]
mod test;
