#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token::TokenClient,
    Address, Env, MuxedAddress, Vec,
};

const BASIS_POINTS_TOTAL: u32 = 10_000;
const MAX_SAFE_PAYMENT_AMOUNT: i128 = i128::MAX / BASIS_POINTS_TOTAL as i128;
const LEGACY_STORAGE_VERSION: u32 = 1;
const CURRENT_STORAGE_VERSION: u32 = 2;
const MAX_INDEX_PAGE_SIZE: u32 = 50;
const STORAGE_TTL_THRESHOLD_LEDGERS: u32 = 250_000;
const STORAGE_TTL_EXTEND_TO_LEDGERS: u32 = 500_000;

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
    SoldOut = 13,
    InsufficientBalance = 14,
    PassNotActive = 15,
    PassExpired = 16,
    RefundNotAvailable = 17,
    InvalidRecipient = 18,
    InvalidPageSize = 19,
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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pass {
    pub id: u64,
    pub campaign_id: u64,
    pub owner: Address,
    pub status: PassStatus,
    pub purchased_at: u64,
    pub purchase_amounts: PurchaseAmounts,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IndexMigrationStatus {
    pub campaign_cursor: u64,
    pub pass_cursor: u64,
    pub campaigns_complete: bool,
    pub passes_complete: bool,
}

#[contracttype]
enum DataKey {
    Config,
    StorageVersion,
    CampaignCount,
    Campaign(u64),
    CampaignIndexCursor,
    MerchantCampaignCount(Address),
    MerchantCampaign(Address, u64),
    CampaignIndex(u64),
    PassCount,
    Pass(u64),
    PassIndexCursor,
    OwnerPassCount(Address),
    OwnerPass(Address, u64),
    PassOwnerIndex(u64),
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

#[derive(Clone, Debug, Eq, PartialEq)]
#[contractevent(topics = ["pass_purchased"])]
pub struct PassPurchased {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub pass_id: u64,
    #[topic]
    pub customer: Address,
    pub total: i128,
    pub merchant_release: i128,
    pub protected_reserve: i128,
    pub platform_fee: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contractevent(topics = ["pass_gifted"])]
pub struct PassGifted {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub pass_id: u64,
    #[topic]
    pub previous_owner: Address,
    pub recipient: Address,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contractevent(topics = ["pass_redeemed"])]
pub struct PassRedeemed {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub pass_id: u64,
    #[topic]
    pub owner: Address,
    pub merchant: Address,
    pub reserve_released: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contractevent(topics = ["pass_refunded"])]
pub struct PassRefunded {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub pass_id: u64,
    #[topic]
    pub owner: Address,
    pub amount: i128,
    pub full_refund: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contractevent(topics = ["campaign_cancelled"])]
pub struct CampaignCancelled {
    #[topic]
    pub campaign_id: u64,
    #[topic]
    pub merchant: Address,
    pub replenished: i128,
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
        env.storage().instance().set(&DataKey::PassCount, &0_u64);
        env.storage()
            .instance()
            .set(&DataKey::StorageVersion, &CURRENT_STORAGE_VERSION);
        env.storage()
            .instance()
            .set(&DataKey::CampaignIndexCursor, &1_u64);
        env.storage()
            .instance()
            .set(&DataKey::PassIndexCursor, &1_u64);
        Self::extend_instance_ttl(&env);
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
            refunded: 0,
            merchant_released: 0,
            protected_funds: 0,
            platform_fees_paid: 0,
            cancellation_shortfall: 0,
            cancellation_funds: 0,
            expires_at: terms.expires_at,
            financial_rules: terms.financial_rules.clone(),
            status: CampaignStatus::Draft,
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .instance()
            .set(&DataKey::CampaignCount, &campaign_id);
        Self::save_campaign(&env, &campaign);
        Self::append_merchant_campaign(&env, &campaign)?;
        Self::advance_campaign_cursor_after_write(&env, campaign_id);
        Self::extend_instance_ttl(&env);

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

    pub fn quote_purchase(env: Env, campaign_id: u64) -> Result<PurchaseAmounts, Error> {
        let campaign = Self::load_campaign(&env, campaign_id)?;
        Self::calculate_distribution(campaign.pass_price, &campaign.financial_rules)
    }

    pub fn purchase(env: Env, campaign_id: u64, customer: Address) -> Result<u64, Error> {
        let mut campaign = Self::load_campaign(&env, campaign_id)?;
        if Self::effective_status(&env, &campaign) == CampaignStatus::Expired {
            return Err(Error::CampaignExpired);
        }
        if campaign.status != CampaignStatus::Active {
            return Err(Error::InvalidState);
        }

        let next_sold = campaign.sold.checked_add(1).ok_or(Error::Overflow)?;
        if next_sold > campaign.max_supply {
            return Err(Error::SoldOut);
        }

        let current_pass_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PassCount)
            .unwrap_or(0);
        let pass_id = current_pass_id.checked_add(1).ok_or(Error::Overflow)?;
        let amounts = Self::calculate_distribution(campaign.pass_price, &campaign.financial_rules)?;
        let token = TokenClient::new(&env, &campaign.payment_asset);
        if token.balance(&customer) < amounts.total {
            return Err(Error::InsufficientBalance);
        }

        customer.require_auth();

        campaign.sold = next_sold;
        campaign.merchant_released = campaign
            .merchant_released
            .checked_add(amounts.merchant_release)
            .ok_or(Error::Overflow)?;
        campaign.protected_funds = campaign
            .protected_funds
            .checked_add(amounts.protected_reserve)
            .ok_or(Error::Overflow)?;
        campaign.platform_fees_paid = campaign
            .platform_fees_paid
            .checked_add(amounts.platform_fee)
            .ok_or(Error::Overflow)?;
        campaign.cancellation_shortfall = campaign
            .cancellation_shortfall
            .checked_add(Self::released_portion(&amounts)?)
            .ok_or(Error::Overflow)?;

        let pass = Pass {
            id: pass_id,
            campaign_id,
            owner: customer.clone(),
            status: PassStatus::Active,
            purchased_at: env.ledger().timestamp(),
            purchase_amounts: amounts.clone(),
        };
        Self::save_campaign(&env, &campaign);
        env.storage().instance().set(&DataKey::PassCount, &pass_id);
        Self::save_pass(&env, &pass);
        Self::append_owner_pass(&env, &pass)?;
        Self::advance_pass_cursor_after_write(&env, pass_id);
        Self::extend_instance_ttl(&env);

        let contract_address = env.current_contract_address();
        token.transfer(
            &customer,
            MuxedAddress::from(&contract_address),
            &amounts.protected_reserve,
        );
        token.transfer(
            &customer,
            MuxedAddress::from(&campaign.merchant),
            &amounts.merchant_release,
        );
        if amounts.platform_fee > 0 {
            token.transfer(
                &customer,
                MuxedAddress::from(&campaign.platform),
                &amounts.platform_fee,
            );
        }

        PassPurchased {
            campaign_id,
            pass_id,
            customer,
            total: amounts.total,
            merchant_release: amounts.merchant_release,
            protected_reserve: amounts.protected_reserve,
            platform_fee: amounts.platform_fee,
        }
        .publish(&env);

        Ok(pass_id)
    }

    pub fn gift_pass(
        env: Env,
        pass_id: u64,
        owner: Address,
        recipient: Address,
    ) -> Result<(), Error> {
        let mut pass = Self::load_pass(&env, pass_id)?;
        if pass.status != PassStatus::Active {
            return Err(Error::PassNotActive);
        }
        if pass.owner != owner {
            return Err(Error::Unauthorized);
        }
        if owner == recipient {
            return Err(Error::InvalidRecipient);
        }

        let campaign = Self::load_campaign(&env, pass.campaign_id)?;
        match Self::effective_status(&env, &campaign) {
            CampaignStatus::Cancelled => return Err(Error::InvalidState),
            CampaignStatus::Expired => return Err(Error::PassExpired),
            _ => {}
        }

        owner.require_auth();
        Self::ensure_pass_indexed(&env, &pass)?;
        Self::remove_owner_pass(&env, &pass)?;
        pass.owner = recipient.clone();
        Self::save_pass(&env, &pass);
        Self::append_owner_pass(&env, &pass)?;
        Self::extend_instance_ttl(&env);

        PassGifted {
            campaign_id: pass.campaign_id,
            pass_id,
            previous_owner: owner,
            recipient,
        }
        .publish(&env);
        Ok(())
    }

    pub fn redeem_pass(
        env: Env,
        pass_id: u64,
        merchant: Address,
        owner: Address,
    ) -> Result<(), Error> {
        let mut pass = Self::load_pass(&env, pass_id)?;
        if pass.status != PassStatus::Active {
            return Err(Error::PassNotActive);
        }
        if pass.owner != owner {
            return Err(Error::Unauthorized);
        }

        let mut campaign = Self::load_campaign(&env, pass.campaign_id)?;
        if campaign.merchant != merchant {
            return Err(Error::Unauthorized);
        }
        match Self::effective_status(&env, &campaign) {
            CampaignStatus::Cancelled => return Err(Error::InvalidState),
            CampaignStatus::Expired => return Err(Error::PassExpired),
            _ => {}
        }

        let contract_address = env.current_contract_address();
        let token = TokenClient::new(&env, &campaign.payment_asset);
        let reserve = pass.purchase_amounts.protected_reserve;
        if token.balance(&contract_address) < reserve {
            return Err(Error::InsufficientBalance);
        }

        merchant.require_auth();
        if owner != merchant {
            owner.require_auth();
        }

        let released = Self::released_portion(&pass.purchase_amounts)?;
        campaign.redeemed = campaign.redeemed.checked_add(1).ok_or(Error::Overflow)?;
        campaign.merchant_released = campaign
            .merchant_released
            .checked_add(reserve)
            .ok_or(Error::Overflow)?;
        campaign.protected_funds = campaign
            .protected_funds
            .checked_sub(reserve)
            .ok_or(Error::Overflow)?;
        campaign.cancellation_shortfall = campaign
            .cancellation_shortfall
            .checked_sub(released)
            .ok_or(Error::Overflow)?;
        pass.status = PassStatus::Redeemed;
        Self::save_campaign(&env, &campaign);
        Self::save_pass(&env, &pass);

        token.transfer(
            &contract_address,
            MuxedAddress::from(&campaign.merchant),
            &reserve,
        );

        PassRedeemed {
            campaign_id: pass.campaign_id,
            pass_id,
            owner,
            merchant,
            reserve_released: reserve,
        }
        .publish(&env);
        Ok(())
    }

    pub fn refund_pass(env: Env, pass_id: u64, owner: Address) -> Result<i128, Error> {
        let mut pass = Self::load_pass(&env, pass_id)?;
        if pass.status != PassStatus::Active {
            return Err(Error::PassNotActive);
        }
        if pass.owner != owner {
            return Err(Error::Unauthorized);
        }

        let mut campaign = Self::load_campaign(&env, pass.campaign_id)?;
        let full_refund = campaign.status == CampaignStatus::Cancelled;
        let refund_amount = if full_refund {
            pass.purchase_amounts.total
        } else if env.ledger().timestamp() >= campaign.expires_at {
            pass.purchase_amounts.protected_reserve
        } else {
            return Err(Error::RefundNotAvailable);
        };

        let contract_address = env.current_contract_address();
        let token = TokenClient::new(&env, &campaign.payment_asset);
        if token.balance(&contract_address) < refund_amount {
            return Err(Error::InsufficientBalance);
        }

        owner.require_auth();
        let released = Self::released_portion(&pass.purchase_amounts)?;
        campaign.refunded = campaign.refunded.checked_add(1).ok_or(Error::Overflow)?;
        campaign.protected_funds = campaign
            .protected_funds
            .checked_sub(pass.purchase_amounts.protected_reserve)
            .ok_or(Error::Overflow)?;
        campaign.cancellation_shortfall = campaign
            .cancellation_shortfall
            .checked_sub(released)
            .ok_or(Error::Overflow)?;
        if full_refund {
            campaign.cancellation_funds = campaign
                .cancellation_funds
                .checked_sub(released)
                .ok_or(Error::Overflow)?;
        }
        pass.status = PassStatus::Refunded;
        Self::save_campaign(&env, &campaign);
        Self::save_pass(&env, &pass);

        token.transfer(
            &contract_address,
            MuxedAddress::from(&owner),
            &refund_amount,
        );

        PassRefunded {
            campaign_id: pass.campaign_id,
            pass_id,
            owner,
            amount: refund_amount,
            full_refund,
        }
        .publish(&env);
        Ok(refund_amount)
    }

    pub fn cancel_campaign(env: Env, campaign_id: u64, merchant: Address) -> Result<i128, Error> {
        let mut campaign = Self::load_campaign(&env, campaign_id)?;
        if campaign.merchant != merchant {
            return Err(Error::Unauthorized);
        }
        if Self::effective_status(&env, &campaign) == CampaignStatus::Expired {
            return Err(Error::CampaignExpired);
        }
        match campaign.status {
            CampaignStatus::Draft | CampaignStatus::Active | CampaignStatus::Paused => {}
            _ => return Err(Error::InvalidState),
        }

        let replenished = campaign.cancellation_shortfall;
        let token = TokenClient::new(&env, &campaign.payment_asset);
        if replenished > 0 && token.balance(&merchant) < replenished {
            return Err(Error::InsufficientBalance);
        }

        merchant.require_auth();
        campaign.status = CampaignStatus::Cancelled;
        campaign.cancellation_funds = campaign
            .cancellation_funds
            .checked_add(replenished)
            .ok_or(Error::Overflow)?;
        Self::save_campaign(&env, &campaign);

        if replenished > 0 {
            token.transfer(
                &merchant,
                MuxedAddress::from(&env.current_contract_address()),
                &replenished,
            );
        }

        CampaignCancelled {
            campaign_id,
            merchant,
            replenished,
        }
        .publish(&env);
        Ok(replenished)
    }

    pub fn get_pass(env: Env, pass_id: u64) -> Option<Pass> {
        let pass = Self::load_pass(&env, pass_id).ok()?;
        Some(Self::effective_pass(&env, pass))
    }

    pub fn pass_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::PassCount)
            .unwrap_or(0)
    }

    pub fn storage_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::StorageVersion)
            .unwrap_or(LEGACY_STORAGE_VERSION)
    }

    pub fn index_migration_status(env: Env) -> IndexMigrationStatus {
        Self::migration_status(&env)
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
    ) -> Result<Vec<Campaign>, Error> {
        Self::validate_page_size(limit)?;
        let count = Self::merchant_campaign_count(env.clone(), merchant.clone());
        let mut slot = cursor;
        let mut campaigns = Vec::new(&env);

        while slot < count && campaigns.len() < limit {
            let campaign_id: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::MerchantCampaign(merchant.clone(), slot))
                .ok_or(Error::NotFound)?;
            let mut campaign = Self::load_campaign(&env, campaign_id)?;
            campaign.status = Self::effective_status(&env, &campaign);
            campaigns.push_back(campaign);
            slot = slot.checked_add(1).ok_or(Error::Overflow)?;
        }

        Ok(campaigns)
    }

    pub fn owner_pass_count(env: Env, owner: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerPassCount(owner))
            .unwrap_or(0)
    }

    pub fn get_owner_passes(
        env: Env,
        owner: Address,
        cursor: u64,
        limit: u32,
    ) -> Result<Vec<Pass>, Error> {
        Self::validate_page_size(limit)?;
        let count = Self::owner_pass_count(env.clone(), owner.clone());
        let mut slot = cursor;
        let mut passes = Vec::new(&env);

        while slot < count && passes.len() < limit {
            let pass_id: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::OwnerPass(owner.clone(), slot))
                .ok_or(Error::NotFound)?;
            let pass = Self::effective_pass(&env, Self::load_pass(&env, pass_id)?);
            passes.push_back(pass);
            slot = slot.checked_add(1).ok_or(Error::Overflow)?;
        }

        Ok(passes)
    }

    pub fn migrate_campaign_index(env: Env, limit: u32) -> Result<IndexMigrationStatus, Error> {
        Self::validate_page_size(limit)?;
        let campaign_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0);
        let mut cursor: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CampaignIndexCursor)
            .unwrap_or(1);
        let mut processed = 0_u32;

        while cursor <= campaign_count && processed < limit {
            let campaign = Self::load_campaign(&env, cursor)?;
            Self::append_merchant_campaign(&env, &campaign)?;
            cursor = cursor.checked_add(1).ok_or(Error::Overflow)?;
            processed += 1;
        }
        env.storage()
            .instance()
            .set(&DataKey::CampaignIndexCursor, &cursor);
        Self::finish_storage_migration_if_complete(&env);
        Self::extend_instance_ttl(&env);
        Ok(Self::migration_status(&env))
    }

    pub fn migrate_pass_index(env: Env, limit: u32) -> Result<IndexMigrationStatus, Error> {
        Self::validate_page_size(limit)?;
        let pass_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PassCount)
            .unwrap_or(0);
        let mut cursor: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PassIndexCursor)
            .unwrap_or(1);
        let mut processed = 0_u32;

        while cursor <= pass_count && processed < limit {
            let pass = Self::load_pass(&env, cursor)?;
            Self::append_owner_pass(&env, &pass)?;
            cursor = cursor.checked_add(1).ok_or(Error::Overflow)?;
            processed += 1;
        }
        env.storage()
            .instance()
            .set(&DataKey::PassIndexCursor, &cursor);
        Self::finish_storage_migration_if_complete(&env);
        Self::extend_instance_ttl(&env);
        Ok(Self::migration_status(&env))
    }

    pub fn maintain_storage(
        env: Env,
        campaign_ids: Vec<u64>,
        pass_ids: Vec<u64>,
    ) -> Result<(), Error> {
        let entry_count = campaign_ids
            .len()
            .checked_add(pass_ids.len())
            .ok_or(Error::Overflow)?;
        Self::validate_page_size(entry_count)?;

        for campaign_id in campaign_ids {
            let campaign = Self::load_campaign(&env, campaign_id)?;
            Self::extend_campaign_storage_ttl(&env, &campaign);
        }
        for pass_id in pass_ids {
            let pass = Self::load_pass(&env, pass_id)?;
            Self::extend_pass_storage_ttl(&env, &pass);
        }
        Self::extend_instance_ttl(&env);
        Ok(())
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
        let key = DataKey::Campaign(campaign.id);
        env.storage().persistent().set(&key, campaign);
        Self::extend_persistent_ttl(env, &key);
        Self::extend_instance_ttl(env);
    }

    fn load_pass(env: &Env, pass_id: u64) -> Result<Pass, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Pass(pass_id))
            .ok_or(Error::NotFound)
    }

    fn save_pass(env: &Env, pass: &Pass) {
        let key = DataKey::Pass(pass.id);
        env.storage().persistent().set(&key, pass);
        Self::extend_persistent_ttl(env, &key);
        Self::extend_instance_ttl(env);
    }

    fn append_merchant_campaign(env: &Env, campaign: &Campaign) -> Result<(), Error> {
        let index_key = DataKey::CampaignIndex(campaign.id);
        if env.storage().persistent().has(&index_key) {
            return Ok(());
        }

        let count_key = DataKey::MerchantCampaignCount(campaign.merchant.clone());
        let slot: u64 = env.storage().persistent().get(&count_key).unwrap_or(0);
        let next_count = slot.checked_add(1).ok_or(Error::Overflow)?;
        let slot_key = DataKey::MerchantCampaign(campaign.merchant.clone(), slot);
        env.storage().persistent().set(&slot_key, &campaign.id);
        env.storage().persistent().set(&index_key, &slot);
        env.storage().persistent().set(&count_key, &next_count);
        Self::extend_persistent_ttl(env, &slot_key);
        Self::extend_persistent_ttl(env, &index_key);
        Self::extend_persistent_ttl(env, &count_key);
        Ok(())
    }

    fn append_owner_pass(env: &Env, pass: &Pass) -> Result<(), Error> {
        let index_key = DataKey::PassOwnerIndex(pass.id);
        if env.storage().persistent().has(&index_key) {
            return Ok(());
        }

        let count_key = DataKey::OwnerPassCount(pass.owner.clone());
        let slot: u64 = env.storage().persistent().get(&count_key).unwrap_or(0);
        let next_count = slot.checked_add(1).ok_or(Error::Overflow)?;
        let slot_key = DataKey::OwnerPass(pass.owner.clone(), slot);
        env.storage().persistent().set(&slot_key, &pass.id);
        env.storage().persistent().set(&index_key, &slot);
        env.storage().persistent().set(&count_key, &next_count);
        Self::extend_persistent_ttl(env, &slot_key);
        Self::extend_persistent_ttl(env, &index_key);
        Self::extend_persistent_ttl(env, &count_key);
        Ok(())
    }

    fn ensure_pass_indexed(env: &Env, pass: &Pass) -> Result<(), Error> {
        if !env
            .storage()
            .persistent()
            .has(&DataKey::PassOwnerIndex(pass.id))
        {
            Self::append_owner_pass(env, pass)?;
        }
        Ok(())
    }

    fn remove_owner_pass(env: &Env, pass: &Pass) -> Result<(), Error> {
        let index_key = DataKey::PassOwnerIndex(pass.id);
        let slot: u64 = env
            .storage()
            .persistent()
            .get(&index_key)
            .ok_or(Error::NotFound)?;
        let count_key = DataKey::OwnerPassCount(pass.owner.clone());
        let count: u64 = env
            .storage()
            .persistent()
            .get(&count_key)
            .ok_or(Error::NotFound)?;
        if count == 0 || slot >= count {
            return Err(Error::InvalidState);
        }

        let last_slot = count - 1;
        let last_slot_key = DataKey::OwnerPass(pass.owner.clone(), last_slot);
        if slot != last_slot {
            let moved_pass_id: u64 = env
                .storage()
                .persistent()
                .get(&last_slot_key)
                .ok_or(Error::NotFound)?;
            let slot_key = DataKey::OwnerPass(pass.owner.clone(), slot);
            let moved_index_key = DataKey::PassOwnerIndex(moved_pass_id);
            env.storage().persistent().set(&slot_key, &moved_pass_id);
            env.storage().persistent().set(&moved_index_key, &slot);
            Self::extend_persistent_ttl(env, &slot_key);
            Self::extend_persistent_ttl(env, &moved_index_key);
        }

        env.storage().persistent().remove(&last_slot_key);
        env.storage().persistent().remove(&index_key);
        env.storage().persistent().set(&count_key, &last_slot);
        Self::extend_persistent_ttl(env, &count_key);
        Ok(())
    }

    fn advance_campaign_cursor_after_write(env: &Env, campaign_id: u64) {
        let cursor: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CampaignIndexCursor)
            .unwrap_or(1);
        if cursor == campaign_id {
            if let Some(next_cursor) = campaign_id.checked_add(1) {
                env.storage()
                    .instance()
                    .set(&DataKey::CampaignIndexCursor, &next_cursor);
            }
        }
    }

    fn advance_pass_cursor_after_write(env: &Env, pass_id: u64) {
        let cursor: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PassIndexCursor)
            .unwrap_or(1);
        if cursor == pass_id {
            if let Some(next_cursor) = pass_id.checked_add(1) {
                env.storage()
                    .instance()
                    .set(&DataKey::PassIndexCursor, &next_cursor);
            }
        }
    }

    fn migration_status(env: &Env) -> IndexMigrationStatus {
        let campaign_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0);
        let pass_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PassCount)
            .unwrap_or(0);
        let campaign_cursor: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CampaignIndexCursor)
            .unwrap_or(1);
        let pass_cursor: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PassIndexCursor)
            .unwrap_or(1);
        IndexMigrationStatus {
            campaign_cursor,
            pass_cursor,
            campaigns_complete: campaign_cursor > campaign_count,
            passes_complete: pass_cursor > pass_count,
        }
    }

    fn finish_storage_migration_if_complete(env: &Env) {
        let status = Self::migration_status(env);
        if status.campaigns_complete && status.passes_complete {
            env.storage()
                .instance()
                .set(&DataKey::StorageVersion, &CURRENT_STORAGE_VERSION);
        }
    }

    fn extend_campaign_storage_ttl(env: &Env, campaign: &Campaign) {
        Self::extend_persistent_ttl(env, &DataKey::Campaign(campaign.id));
        let index_key = DataKey::CampaignIndex(campaign.id);
        if let Some(slot) = env.storage().persistent().get::<_, u64>(&index_key) {
            Self::extend_persistent_ttl(env, &index_key);
            Self::extend_persistent_ttl(
                env,
                &DataKey::MerchantCampaign(campaign.merchant.clone(), slot),
            );
            Self::extend_persistent_ttl(
                env,
                &DataKey::MerchantCampaignCount(campaign.merchant.clone()),
            );
        }
    }

    fn extend_pass_storage_ttl(env: &Env, pass: &Pass) {
        Self::extend_persistent_ttl(env, &DataKey::Pass(pass.id));
        let index_key = DataKey::PassOwnerIndex(pass.id);
        if let Some(slot) = env.storage().persistent().get::<_, u64>(&index_key) {
            Self::extend_persistent_ttl(env, &index_key);
            Self::extend_persistent_ttl(env, &DataKey::OwnerPass(pass.owner.clone(), slot));
            Self::extend_persistent_ttl(env, &DataKey::OwnerPassCount(pass.owner.clone()));
        }
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

    fn validate_page_size(limit: u32) -> Result<(), Error> {
        if limit == 0 || limit > MAX_INDEX_PAGE_SIZE {
            return Err(Error::InvalidPageSize);
        }
        Ok(())
    }

    fn effective_pass(env: &Env, mut pass: Pass) -> Pass {
        if pass.status == PassStatus::Active {
            if let Ok(campaign) = Self::load_campaign(env, pass.campaign_id) {
                if campaign.status != CampaignStatus::Cancelled
                    && env.ledger().timestamp() >= campaign.expires_at
                {
                    pass.status = PassStatus::Expired;
                }
            }
        }
        pass
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
        terms
            .pass_price
            .checked_mul(i128::from(terms.max_supply))
            .ok_or(Error::InvalidAmount)?;

        let rules = &terms.financial_rules;
        let total = rules
            .merchant_bps
            .checked_add(rules.reserve_bps)
            .and_then(|value| value.checked_add(rules.platform_fee_bps))
            .ok_or(Error::InvalidFinancialRules)?;
        if rules.merchant_bps == 0 || rules.reserve_bps == 0 || total != BASIS_POINTS_TOTAL {
            return Err(Error::InvalidFinancialRules);
        }
        Self::calculate_distribution(terms.pass_price, rules)?;

        Ok(())
    }

    fn calculate_distribution(
        total: i128,
        rules: &FinancialRules,
    ) -> Result<PurchaseAmounts, Error> {
        let merchant_base = total
            .checked_mul(i128::from(rules.merchant_bps))
            .ok_or(Error::Overflow)?
            / i128::from(BASIS_POINTS_TOTAL);
        let protected_reserve = total
            .checked_mul(i128::from(rules.reserve_bps))
            .ok_or(Error::Overflow)?
            / i128::from(BASIS_POINTS_TOTAL);
        let platform_fee = total
            .checked_mul(i128::from(rules.platform_fee_bps))
            .ok_or(Error::Overflow)?
            / i128::from(BASIS_POINTS_TOTAL);
        let allocated = merchant_base
            .checked_add(protected_reserve)
            .and_then(|value| value.checked_add(platform_fee))
            .ok_or(Error::Overflow)?;
        let remainder = total.checked_sub(allocated).ok_or(Error::Overflow)?;
        let merchant_release = merchant_base
            .checked_add(remainder)
            .ok_or(Error::Overflow)?;

        if merchant_release <= 0
            || protected_reserve <= 0
            || (rules.platform_fee_bps > 0 && platform_fee <= 0)
        {
            return Err(Error::InvalidFinancialRules);
        }

        Ok(PurchaseAmounts {
            total,
            merchant_release,
            protected_reserve,
            platform_fee,
        })
    }

    fn released_portion(amounts: &PurchaseAmounts) -> Result<i128, Error> {
        amounts
            .merchant_release
            .checked_add(amounts.platform_fee)
            .ok_or(Error::Overflow)
    }

    fn effective_status(env: &Env, campaign: &Campaign) -> CampaignStatus {
        if campaign.status == CampaignStatus::Cancelled {
            CampaignStatus::Cancelled
        } else if env.ledger().timestamp() >= campaign.expires_at {
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
