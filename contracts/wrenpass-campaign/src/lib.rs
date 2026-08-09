#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env,
};

const BASIS_POINTS_TOTAL: u32 = 10_000;
const MAX_SAFE_PAYMENT_AMOUNT: i128 = i128::MAX / BASIS_POINTS_TOTAL as i128;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotFound = 3,
    Unauthorized = 4,
    InvalidAmount = 5,
    InvalidSupply = 6,
    InvalidExpiration = 7,
    InvalidFinancialRules = 8,
    InvalidState = 9,
    CampaignExpired = 10,
    Overflow = 11,
    InvalidConfiguration = 12,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CampaignStatus {
    Draft,
    Active,
    Paused,
    Expired,
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
pub struct CampaignTerms {
    pub pass_price: i128,
    pub service_value: i128,
    pub max_supply: u32,
    pub expires_at: u64,
    pub financial_rules: FinancialRules,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractConfig {
    pub platform: Address,
    pub payment_asset: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Campaign {
    pub id: u64,
    pub merchant: Address,
    pub platform: Address,
    pub payment_asset: Address,
    pub pass_price: i128,
    pub service_value: i128,
    pub max_supply: u32,
    pub sold: u32,
    pub redeemed: u32,
    pub expires_at: u64,
    pub financial_rules: FinancialRules,
    pub status: CampaignStatus,
    pub created_at: u64,
}

#[contracttype]
enum DataKey {
    Config,
    CampaignCount,
    Campaign(u64),
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contractevent(topics = ["campaign_created"])]
pub struct CampaignCreated {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub merchant: Address,
    pub payment_asset: Address,
    pub pass_price: i128,
    pub service_value: i128,
    pub max_supply: u32,
    pub expires_at: u64,
    pub financial_rules: FinancialRules,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contractevent(topics = ["campaign_status_changed"])]
pub struct CampaignStatusChanged {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub merchant: Address,
    pub previous: CampaignStatus,
    pub current: CampaignStatus,
}

#[contract]
pub struct WrenPassContract;

#[contractimpl]
impl WrenPassContract {
    pub fn initialize(env: Env, platform: Address, payment_asset: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        if platform == payment_asset {
            return Err(Error::InvalidConfiguration);
        }

        platform.require_auth();
        env.storage().instance().set(
            &DataKey::Config,
            &ContractConfig {
                platform,
                payment_asset,
            },
        );
        env.storage()
            .instance()
            .set(&DataKey::CampaignCount, &0_u64);
        Ok(())
    }

    pub fn get_config(env: Env) -> Result<ContractConfig, Error> {
        Self::load_config(&env)
    }

    pub fn create_campaign(
        env: Env,
        merchant: Address,
        terms: CampaignTerms,
    ) -> Result<u64, Error> {
        let config = Self::load_config(&env)?;
        Self::validate_terms(&env, &terms)?;
        merchant.require_auth();

        let current_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0);
        let campaign_id = current_id.checked_add(1).ok_or(Error::Overflow)?;
        let campaign = Campaign {
            id: campaign_id,
            merchant: merchant.clone(),
            platform: config.platform,
            payment_asset: config.payment_asset.clone(),
            pass_price: terms.pass_price,
            service_value: terms.service_value,
            max_supply: terms.max_supply,
            sold: 0,
            redeemed: 0,
            expires_at: terms.expires_at,
            financial_rules: terms.financial_rules.clone(),
            status: CampaignStatus::Draft,
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .instance()
            .set(&DataKey::CampaignCount, &campaign_id);
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);

        CampaignCreated {
            campaign_id,
            merchant,
            payment_asset: config.payment_asset,
            pass_price: terms.pass_price,
            service_value: terms.service_value,
            max_supply: terms.max_supply,
            expires_at: terms.expires_at,
            financial_rules: terms.financial_rules,
        }
        .publish(&env);

        Ok(campaign_id)
    }

    pub fn get_campaign(env: Env, campaign_id: u64) -> Option<Campaign> {
        let mut campaign = Self::load_campaign(&env, campaign_id).ok()?;
        campaign.status = Self::effective_status(&env, &campaign);
        Some(campaign)
    }

    pub fn campaign_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0)
    }

    pub fn remaining_supply(env: Env, campaign_id: u64) -> Result<u32, Error> {
        let campaign = Self::load_campaign(&env, campaign_id)?;
        campaign
            .max_supply
            .checked_sub(campaign.sold)
            .ok_or(Error::Overflow)
    }

    pub fn publish_campaign(env: Env, campaign_id: u64, merchant: Address) -> Result<(), Error> {
        Self::transition(
            &env,
            campaign_id,
            merchant,
            CampaignStatus::Draft,
            CampaignStatus::Active,
        )
    }

    pub fn pause_campaign(env: Env, campaign_id: u64, merchant: Address) -> Result<(), Error> {
        Self::transition(
            &env,
            campaign_id,
            merchant,
            CampaignStatus::Active,
            CampaignStatus::Paused,
        )
    }

    pub fn resume_campaign(env: Env, campaign_id: u64, merchant: Address) -> Result<(), Error> {
        Self::transition(
            &env,
            campaign_id,
            merchant,
            CampaignStatus::Paused,
            CampaignStatus::Active,
        )
    }
}

impl WrenPassContract {
    fn load_config(env: &Env) -> Result<ContractConfig, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    fn load_campaign(env: &Env, campaign_id: u64) -> Result<Campaign, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .ok_or(Error::NotFound)
    }

    fn save_campaign(env: &Env, campaign: &Campaign) {
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign.id), campaign);
    }

    fn validate_terms(env: &Env, terms: &CampaignTerms) -> Result<(), Error> {
        if terms.pass_price <= 0
            || terms.pass_price > MAX_SAFE_PAYMENT_AMOUNT
            || terms.service_value <= terms.pass_price
        {
            return Err(Error::InvalidAmount);
        }
        if terms.max_supply == 0 {
            return Err(Error::InvalidSupply);
        }
        if terms.expires_at <= env.ledger().timestamp() {
            return Err(Error::InvalidExpiration);
        }

        let rules = &terms.financial_rules;
        let total = rules
            .merchant_bps
            .checked_add(rules.reserve_bps)
            .and_then(|value| value.checked_add(rules.platform_fee_bps))
            .ok_or(Error::InvalidFinancialRules)?;
        if rules.merchant_bps == 0 || rules.reserve_bps == 0 || total != BASIS_POINTS_TOTAL {
            return Err(Error::InvalidFinancialRules);
        }

        Ok(())
    }

    fn effective_status(env: &Env, campaign: &Campaign) -> CampaignStatus {
        if env.ledger().timestamp() >= campaign.expires_at {
            CampaignStatus::Expired
        } else {
            campaign.status.clone()
        }
    }

    fn transition(
        env: &Env,
        campaign_id: u64,
        merchant: Address,
        expected: CampaignStatus,
        next: CampaignStatus,
    ) -> Result<(), Error> {
        let mut campaign = Self::load_campaign(env, campaign_id)?;
        if campaign.merchant != merchant {
            return Err(Error::Unauthorized);
        }
        if Self::effective_status(env, &campaign) == CampaignStatus::Expired {
            return Err(Error::CampaignExpired);
        }
        if campaign.status != expected {
            return Err(Error::InvalidState);
        }

        merchant.require_auth();
        let previous = campaign.status.clone();
        campaign.status = next.clone();
        Self::save_campaign(env, &campaign);

        CampaignStatusChanged {
            campaign_id,
            merchant,
            previous,
            current: next,
        }
        .publish(env);
        Ok(())
    }
}

#[cfg(test)]
mod test;
