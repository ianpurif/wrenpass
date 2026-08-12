#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, Address, BytesN, Env,
    String, Val,
};

const STORAGE_TTL_THRESHOLD_LEDGERS: u32 = 250_000;
const STORAGE_TTL_EXTEND_TO_LEDGERS: u32 = 500_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidConfiguration = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FinancialRules {
    pub merchant_bps: u32,
    pub platform_fee_bps: u32,
    pub reserve_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignTerms {
    pub expires_at: u64,
    pub financial_rules: FinancialRules,
    pub max_supply: u32,
    pub pass_price: i128,
    pub service_value: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignMetadataInput {
    pub image_sha256: Option<BytesN<32>>,
    pub image_url: Option<String>,
    pub name: String,
    pub service_description: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublisherConfig {
    pub campaign_contract: Address,
    pub metadata_contract: Address,
}

#[contracttype]
enum DataKey {
    Config,
}

#[contractclient(name = "CampaignClient")]
pub trait Campaign {
    fn create_campaign(env: Env, merchant: Address, terms: CampaignTerms) -> u64;
    fn publish_campaign(env: Env, campaign_id: u64, merchant: Address);
}

#[contractclient(name = "MetadataClient")]
pub trait Metadata {
    fn register_campaign_metadata(
        env: Env,
        campaign_id: u64,
        merchant: Address,
        metadata: CampaignMetadataInput,
    ) -> Val;
}

#[contract]
pub struct WrenPassPublisherContract;

#[contractimpl]
impl WrenPassPublisherContract {
    pub fn initialize(
        env: Env,
        initializer: Address,
        campaign_contract: Address,
        metadata_contract: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        if campaign_contract == metadata_contract {
            return Err(Error::InvalidConfiguration);
        }
        initializer.require_auth();
        env.storage().instance().set(
            &DataKey::Config,
            &PublisherConfig {
                campaign_contract,
                metadata_contract,
            },
        );
        Self::extend_instance_ttl(&env);
        Ok(())
    }

    pub fn get_config(env: Env) -> Result<PublisherConfig, Error> {
        Self::load_config(&env)
    }

    pub fn create_and_publish_campaign(
        env: Env,
        merchant: Address,
        terms: CampaignTerms,
        metadata: CampaignMetadataInput,
    ) -> Result<u64, Error> {
        let config = Self::load_config(&env)?;
        merchant.require_auth();

        let campaign_client = CampaignClient::new(&env, &config.campaign_contract);
        let campaign_id = campaign_client.create_campaign(&merchant, &terms);
        MetadataClient::new(&env, &config.metadata_contract).register_campaign_metadata(
            &campaign_id,
            &merchant,
            &metadata,
        );
        campaign_client.publish_campaign(&campaign_id, &merchant);
        Self::extend_instance_ttl(&env);
        Ok(campaign_id)
    }

    fn load_config(env: &Env) -> Result<PublisherConfig, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    fn extend_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(STORAGE_TTL_THRESHOLD_LEDGERS, STORAGE_TTL_EXTEND_TO_LEDGERS);
    }
}

#[cfg(test)]
mod test;
