#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, Address,
    BytesN, Env, String, Vec,
};

const CURRENT_STORAGE_VERSION: u32 = 1;
const MAX_BUSINESS_NAME_BYTES: u32 = 560;
const MAX_BUSINESS_DESCRIPTION_BYTES: u32 = 8_000;
const MAX_CAMPAIGN_NAME_BYTES: u32 = 560;
const MAX_SERVICE_DESCRIPTION_BYTES: u32 = 16_000;
const MAX_IMAGE_URL_BYTES: u32 = 8_192;
const MAX_PAGE_SIZE: u32 = 50;
const STORAGE_TTL_THRESHOLD_LEDGERS: u32 = 250_000;
const STORAGE_TTL_EXTEND_TO_LEDGERS: u32 = 500_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidBusinessName = 3,
    InvalidBusinessDescription = 4,
    InvalidCampaignName = 5,
    InvalidServiceDescription = 6,
    InvalidImage = 7,
    CampaignNotFound = 8,
    Unauthorized = 9,
    MetadataConflict = 10,
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
pub struct FinancialRules {
    pub merchant_bps: u32,
    pub reserve_bps: u32,
    pub platform_fee_bps: u32,
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
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegistryConfig {
    pub campaign_contract: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MerchantProfileInput {
    pub business_name: String,
    pub description: String,
    pub logo_sha256: Option<BytesN<32>>,
    pub logo_url: Option<String>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MerchantProfile {
    pub business_name: String,
    pub created_at: u64,
    pub description: String,
    pub logo_sha256: Option<BytesN<32>>,
    pub logo_url: Option<String>,
    pub owner: Address,
    pub updated_at: u64,
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
pub struct CampaignMetadata {
    pub campaign_id: u64,
    pub created_at: u64,
    pub image_sha256: Option<BytesN<32>>,
    pub image_url: Option<String>,
    pub merchant: Address,
    pub name: String,
    pub service_description: String,
}

#[contracttype]
enum DataKey {
    Config,
    StorageVersion,
    Merchant(Address),
    Campaign(u64),
    MerchantCampaignCount(Address),
    MerchantCampaign(Address, u64),
    CampaignIndex(u64),
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contractevent(topics = ["merchant_profile_set"])]
pub struct MerchantProfileSet {
    #[topic]
    pub merchant: Address,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contractevent(topics = ["campaign_metadata_registered"])]
pub struct CampaignMetadataRegistered {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub merchant: Address,
}

#[contract]
pub struct WrenPassMetadataContract;

#[contractimpl]
impl WrenPassMetadataContract {
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
        Self::load_config(&env)
    }

    pub fn storage_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::StorageVersion)
            .unwrap_or(0)
    }

    pub fn set_merchant_profile(
        env: Env,
        merchant: Address,
        profile: MerchantProfileInput,
    ) -> Result<MerchantProfile, Error> {
        Self::load_config(&env)?;
        Self::validate_profile(&profile)?;
        merchant.require_auth();

        let key = DataKey::Merchant(merchant.clone());
        let existing: Option<MerchantProfile> = env.storage().persistent().get(&key);
        let timestamp = env.ledger().timestamp();
        let stored = MerchantProfile {
            business_name: profile.business_name,
            created_at: existing
                .map(|current| current.created_at)
                .unwrap_or(timestamp),
            description: profile.description,
            logo_sha256: profile.logo_sha256,
            logo_url: profile.logo_url,
            owner: merchant.clone(),
            updated_at: timestamp,
        };
        env.storage().persistent().set(&key, &stored);
        Self::extend_persistent_ttl(&env, &key);
        Self::extend_instance_ttl(&env);

        MerchantProfileSet {
            merchant,
            updated_at: timestamp,
        }
        .publish(&env);
        Ok(stored)
    }

    pub fn get_merchant_profile(env: Env, merchant: Address) -> Option<MerchantProfile> {
        env.storage().persistent().get(&DataKey::Merchant(merchant))
    }

    pub fn register_campaign_metadata(
        env: Env,
        campaign_id: u64,
        merchant: Address,
        metadata: CampaignMetadataInput,
    ) -> Result<CampaignMetadata, Error> {
        Self::validate_campaign_metadata(&metadata)?;
        let config = Self::load_config(&env)?;
        let campaign = WrenPassCampaignClient::new(&env, &config.campaign_contract)
            .get_campaign(&campaign_id)
            .ok_or(Error::CampaignNotFound)?;
        if campaign.merchant != merchant {
            return Err(Error::Unauthorized);
        }
        merchant.require_auth();

        let key = DataKey::Campaign(campaign_id);
        if let Some(existing) = env.storage().persistent().get::<_, CampaignMetadata>(&key) {
            if existing.merchant == merchant
                && existing.name == metadata.name
                && existing.service_description == metadata.service_description
                && existing.image_url == metadata.image_url
                && existing.image_sha256 == metadata.image_sha256
            {
                return Ok(existing);
            }
            return Err(Error::MetadataConflict);
        }

        let stored = CampaignMetadata {
            campaign_id,
            created_at: env.ledger().timestamp(),
            image_sha256: metadata.image_sha256,
            image_url: metadata.image_url,
            merchant: merchant.clone(),
            name: metadata.name,
            service_description: metadata.service_description,
        };
        env.storage().persistent().set(&key, &stored);
        Self::append_merchant_campaign(&env, &stored)?;
        Self::extend_persistent_ttl(&env, &key);
        Self::extend_instance_ttl(&env);

        CampaignMetadataRegistered {
            campaign_id,
            merchant,
        }
        .publish(&env);
        Ok(stored)
    }

    pub fn get_campaign_metadata(env: Env, campaign_id: u64) -> Option<CampaignMetadata> {
        env.storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
    }

    pub fn merchant_campaign_count(env: Env, merchant: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::MerchantCampaignCount(merchant))
            .unwrap_or(0)
    }

    pub fn get_merchant_campaigns(
        env: Env,
        merchant: Address,
        cursor: u64,
        limit: u32,
    ) -> Result<Vec<CampaignMetadata>, Error> {
        Self::validate_page_size(limit)?;
        let count = Self::merchant_campaign_count(env.clone(), merchant.clone());
        let mut slot = cursor;
        let mut campaigns = Vec::new(&env);
        while slot < count && campaigns.len() < limit {
            let campaign_id: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::MerchantCampaign(merchant.clone(), slot))
                .ok_or(Error::CampaignNotFound)?;
            let metadata: CampaignMetadata = env
                .storage()
                .persistent()
                .get(&DataKey::Campaign(campaign_id))
                .ok_or(Error::CampaignNotFound)?;
            campaigns.push_back(metadata);
            slot = slot.checked_add(1).ok_or(Error::Overflow)?;
        }
        Ok(campaigns)
    }

    pub fn maintain_storage(
        env: Env,
        merchants: Vec<Address>,
        campaign_ids: Vec<u64>,
    ) -> Result<(), Error> {
        let entry_count = merchants
            .len()
            .checked_add(campaign_ids.len())
            .ok_or(Error::Overflow)?;
        Self::validate_page_size(entry_count)?;

        for merchant in merchants {
            let key = DataKey::Merchant(merchant);
            if !env.storage().persistent().has(&key) {
                return Err(Error::Unauthorized);
            }
            Self::extend_persistent_ttl(&env, &key);
        }
        for campaign_id in campaign_ids {
            let metadata: CampaignMetadata = env
                .storage()
                .persistent()
                .get(&DataKey::Campaign(campaign_id))
                .ok_or(Error::CampaignNotFound)?;
            Self::extend_campaign_ttl(&env, &metadata);
        }
        Self::extend_instance_ttl(&env);
        Ok(())
    }
}

impl WrenPassMetadataContract {
    fn load_config(env: &Env) -> Result<RegistryConfig, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    fn validate_profile(profile: &MerchantProfileInput) -> Result<(), Error> {
        if profile.business_name.len() < 2 || profile.business_name.len() > MAX_BUSINESS_NAME_BYTES
        {
            return Err(Error::InvalidBusinessName);
        }
        if profile.description.len() < 20
            || profile.description.len() > MAX_BUSINESS_DESCRIPTION_BYTES
        {
            return Err(Error::InvalidBusinessDescription);
        }
        Self::validate_image(&profile.logo_url, &profile.logo_sha256)
    }

    fn validate_campaign_metadata(metadata: &CampaignMetadataInput) -> Result<(), Error> {
        if metadata.name.len() < 3 || metadata.name.len() > MAX_CAMPAIGN_NAME_BYTES {
            return Err(Error::InvalidCampaignName);
        }
        if metadata.service_description.len() < 20
            || metadata.service_description.len() > MAX_SERVICE_DESCRIPTION_BYTES
        {
            return Err(Error::InvalidServiceDescription);
        }
        Self::validate_image(&metadata.image_url, &metadata.image_sha256)
    }

    fn validate_image(
        image_url: &Option<String>,
        image_sha256: &Option<BytesN<32>>,
    ) -> Result<(), Error> {
        if let Some(url) = image_url {
            if url.is_empty() || url.len() > MAX_IMAGE_URL_BYTES {
                return Err(Error::InvalidImage);
            }
        } else if image_sha256.is_some() {
            return Err(Error::InvalidImage);
        }
        Ok(())
    }

    fn validate_page_size(limit: u32) -> Result<(), Error> {
        if limit == 0 || limit > MAX_PAGE_SIZE {
            return Err(Error::InvalidPageSize);
        }
        Ok(())
    }

    fn append_merchant_campaign(env: &Env, metadata: &CampaignMetadata) -> Result<(), Error> {
        let count_key = DataKey::MerchantCampaignCount(metadata.merchant.clone());
        let slot: u64 = env.storage().persistent().get(&count_key).unwrap_or(0);
        let next_count = slot.checked_add(1).ok_or(Error::Overflow)?;
        let slot_key = DataKey::MerchantCampaign(metadata.merchant.clone(), slot);
        let index_key = DataKey::CampaignIndex(metadata.campaign_id);
        env.storage()
            .persistent()
            .set(&slot_key, &metadata.campaign_id);
        env.storage().persistent().set(&index_key, &slot);
        env.storage().persistent().set(&count_key, &next_count);
        Self::extend_persistent_ttl(env, &slot_key);
        Self::extend_persistent_ttl(env, &index_key);
        Self::extend_persistent_ttl(env, &count_key);
        Ok(())
    }

    fn extend_campaign_ttl(env: &Env, metadata: &CampaignMetadata) {
        Self::extend_persistent_ttl(env, &DataKey::Campaign(metadata.campaign_id));
        let index_key = DataKey::CampaignIndex(metadata.campaign_id);
        let Some(slot) = env.storage().persistent().get::<_, u64>(&index_key) else {
            return;
        };
        let count_key = DataKey::MerchantCampaignCount(metadata.merchant.clone());
        let slot_key = DataKey::MerchantCampaign(metadata.merchant.clone(), slot);
        Self::extend_persistent_ttl(env, &slot_key);
        Self::extend_persistent_ttl(env, &index_key);
        Self::extend_persistent_ttl(env, &count_key);
    }

    fn extend_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(STORAGE_TTL_THRESHOLD_LEDGERS, STORAGE_TTL_EXTEND_TO_LEDGERS);
    }

    fn extend_persistent_ttl(env: &Env, key: &DataKey) {
        env.storage().persistent().extend_ttl(
            key,
            STORAGE_TTL_THRESHOLD_LEDGERS,
            STORAGE_TTL_EXTEND_TO_LEDGERS,
        );
    }
}

#[cfg(test)]
mod test;
