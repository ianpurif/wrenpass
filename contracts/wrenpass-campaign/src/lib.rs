#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token::TokenClient,
    Address, Env, MuxedAddress,
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
    SoldOut = 13,
    InsufficientBalance = 14,
    PassNotActive = 15,
    PassExpired = 16,
    RefundNotAvailable = 17,
    InvalidRecipient = 18,
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
enum DataKey {
    Config,
    CampaignCount,
    Campaign(u64),
    PassCount,
    Pass(u64),
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
        env.storage()
            .persistent()
            .set(&DataKey::Pass(pass_id), &pass);

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
        pass.owner = recipient.clone();
        Self::save_pass(&env, &pass);

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
        let mut pass = Self::load_pass(&env, pass_id).ok()?;
        if pass.status == PassStatus::Active {
            if let Ok(campaign) = Self::load_campaign(&env, pass.campaign_id) {
                if campaign.status != CampaignStatus::Cancelled
                    && env.ledger().timestamp() >= campaign.expires_at
                {
                    pass.status = PassStatus::Expired;
                }
            }
        }
        Some(pass)
    }

    pub fn pass_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::PassCount)
            .unwrap_or(0)
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

    fn load_pass(env: &Env, pass_id: u64) -> Result<Pass, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Pass(pass_id))
            .ok_or(Error::NotFound)
    }

    fn save_pass(env: &Env, pass: &Pass) {
        env.storage()
            .persistent()
            .set(&DataKey::Pass(pass.id), pass);
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
