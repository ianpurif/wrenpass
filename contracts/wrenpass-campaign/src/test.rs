extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke},
    Address, Env, Event, IntoVal,
};

const NOW: u64 = 1_000_000;

fn default_terms() -> CampaignTerms {
    CampaignTerms {
        pass_price: 50_000_000,
        service_value: 60_000_000,
        max_supply: 100,
        expires_at: NOW + 30 * 86_400,
        financial_rules: FinancialRules {
            merchant_bps: 7_500,
            reserve_bps: 2_000,
            platform_fee_bps: 500,
        },
    }
}

fn setup() -> (
    Env,
    Address,
    WrenPassContractClient<'static>,
    Address,
    Address,
) {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);
    env.mock_all_auths();
    let contract_id = env.register(WrenPassContract, ());
    let client = WrenPassContractClient::new(&env, &contract_id);
    let platform = Address::generate(&env);
    let payment_asset = Address::generate(&env);
    client.initialize(&platform, &payment_asset);
    (env, contract_id, client, platform, payment_asset)
}

fn create(client: &WrenPassContractClient, merchant: &Address, terms: &CampaignTerms) -> u64 {
    client.create_campaign(merchant, terms)
}

#[test]
fn initialization_is_authorized_and_one_time_only() {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);
    let contract_id = env.register(WrenPassContract, ());
    let client = WrenPassContractClient::new(&env, &contract_id);
    let platform = Address::generate(&env);
    let payment_asset = Address::generate(&env);

    assert!(client.try_initialize(&platform, &payment_asset).is_err());

    env.mock_all_auths();
    client.initialize(&platform, &payment_asset);
    assert_eq!(
        client.try_initialize(&platform, &payment_asset),
        Err(Ok(Error::AlreadyInitialized))
    );
    assert_eq!(
        client.get_config(),
        ContractConfig {
            platform,
            payment_asset,
        }
    );
}

#[test]
fn rejects_payment_asset_as_the_platform_recipient() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(WrenPassContract, ());
    let client = WrenPassContractClient::new(&env, &contract_id);
    let shared_address = Address::generate(&env);

    assert_eq!(
        client.try_initialize(&shared_address, &shared_address),
        Err(Ok(Error::InvalidConfiguration))
    );
}

#[test]
fn creation_requires_the_merchant_authorization() {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);
    let contract_id = env.register(WrenPassContract, ());
    let client = WrenPassContractClient::new(&env, &contract_id);
    let platform = Address::generate(&env);
    let payment_asset = Address::generate(&env);
    let merchant = Address::generate(&env);

    env.mock_auths(&[MockAuth {
        address: &platform,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (platform.clone(), payment_asset.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&platform, &payment_asset);

    assert!(client
        .try_create_campaign(&merchant, &default_terms())
        .is_err());
}

#[test]
fn creates_campaign_with_unique_id_fixed_supply_and_event() {
    let (env, _contract_id, client, platform, payment_asset) = setup();
    let merchant = Address::generate(&env);
    let terms = default_terms();

    let first_id = create(&client, &merchant, &terms);
    assert_eq!(
        env.events().all(),
        std::vec![CampaignCreated {
            campaign_id: first_id,
            merchant: merchant.clone(),
            payment_asset: payment_asset.clone(),
            pass_price: terms.pass_price,
            service_value: terms.service_value,
            max_supply: terms.max_supply,
            expires_at: terms.expires_at,
            financial_rules: terms.financial_rules.clone(),
        }
        .to_xdr(&env, &_contract_id)]
    );
    let second_id = create(&client, &merchant, &terms);
    assert_eq!(
        env.events().all(),
        std::vec![CampaignCreated {
            campaign_id: second_id,
            merchant: merchant.clone(),
            payment_asset: payment_asset.clone(),
            pass_price: terms.pass_price,
            service_value: terms.service_value,
            max_supply: terms.max_supply,
            expires_at: terms.expires_at,
            financial_rules: terms.financial_rules.clone(),
        }
        .to_xdr(&env, &_contract_id)]
    );
    let campaign = client.get_campaign(&first_id).unwrap();

    assert_eq!(first_id, 1);
    assert_eq!(second_id, 2);
    assert_eq!(client.campaign_count(), 2);
    assert_eq!(campaign.merchant, merchant);
    assert_eq!(campaign.platform, platform);
    assert_eq!(campaign.payment_asset, payment_asset);
    assert_eq!(campaign.pass_price, terms.pass_price);
    assert_eq!(campaign.service_value, terms.service_value);
    assert_eq!(campaign.max_supply, 100);
    assert_eq!(campaign.sold, 0);
    assert_eq!(campaign.redeemed, 0);
    assert_eq!(campaign.status, CampaignStatus::Draft);
    assert_eq!(client.remaining_supply(&first_id), 100);
}

#[test]
fn rejects_invalid_amount_supply_expiration_and_financial_rules() {
    let (env, _contract_id, client, _platform, _payment_asset) = setup();
    let merchant = Address::generate(&env);

    let mut terms = default_terms();
    terms.pass_price = 0;
    assert_eq!(
        client.try_create_campaign(&merchant, &terms),
        Err(Ok(Error::InvalidAmount))
    );

    let mut terms = default_terms();
    terms.service_value = terms.pass_price;
    assert_eq!(
        client.try_create_campaign(&merchant, &terms),
        Err(Ok(Error::InvalidAmount))
    );

    let mut terms = default_terms();
    terms.pass_price = MAX_SAFE_PAYMENT_AMOUNT + 1;
    terms.service_value = terms.pass_price + 1;
    assert_eq!(
        client.try_create_campaign(&merchant, &terms),
        Err(Ok(Error::InvalidAmount))
    );

    let mut terms = default_terms();
    terms.max_supply = 0;
    assert_eq!(
        client.try_create_campaign(&merchant, &terms),
        Err(Ok(Error::InvalidSupply))
    );

    let mut terms = default_terms();
    terms.expires_at = NOW;
    assert_eq!(
        client.try_create_campaign(&merchant, &terms),
        Err(Ok(Error::InvalidExpiration))
    );

    let mut terms = default_terms();
    terms.financial_rules.reserve_bps = 0;
    terms.financial_rules.merchant_bps = 9_500;
    assert_eq!(
        client.try_create_campaign(&merchant, &terms),
        Err(Ok(Error::InvalidFinancialRules))
    );

    let mut terms = default_terms();
    terms.financial_rules.platform_fee_bps = 501;
    assert_eq!(
        client.try_create_campaign(&merchant, &terms),
        Err(Ok(Error::InvalidFinancialRules))
    );
}

#[test]
fn supports_the_full_u32_supply_boundary_without_overflow() {
    let (env, _contract_id, client, _platform, _payment_asset) = setup();
    let merchant = Address::generate(&env);
    let mut terms = default_terms();
    terms.max_supply = u32::MAX;

    let campaign_id = create(&client, &merchant, &terms);

    assert_eq!(client.remaining_supply(&campaign_id), u32::MAX);
}

#[test]
fn only_the_campaign_merchant_can_change_status() {
    let (env, _contract_id, client, _platform, _payment_asset) = setup();
    let merchant = Address::generate(&env);
    let other = Address::generate(&env);
    let campaign_id = create(&client, &merchant, &default_terms());

    assert_eq!(
        client.try_publish_campaign(&campaign_id, &other),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        client.get_campaign(&campaign_id).unwrap().status,
        CampaignStatus::Draft
    );
}

#[test]
fn supports_only_valid_status_transitions_and_emits_events() {
    let (env, _contract_id, client, _platform, _payment_asset) = setup();
    let merchant = Address::generate(&env);
    let campaign_id = create(&client, &merchant, &default_terms());

    assert_eq!(
        client.try_pause_campaign(&campaign_id, &merchant),
        Err(Ok(Error::InvalidState))
    );

    client.publish_campaign(&campaign_id, &merchant);
    assert_eq!(
        env.events().all(),
        std::vec![CampaignStatusChanged {
            campaign_id,
            merchant: merchant.clone(),
            previous: CampaignStatus::Draft,
            current: CampaignStatus::Active,
        }
        .to_xdr(&env, &_contract_id)]
    );
    assert_eq!(
        client.get_campaign(&campaign_id).unwrap().status,
        CampaignStatus::Active
    );
    client.pause_campaign(&campaign_id, &merchant);
    assert_eq!(
        env.events().all(),
        std::vec![CampaignStatusChanged {
            campaign_id,
            merchant: merchant.clone(),
            previous: CampaignStatus::Active,
            current: CampaignStatus::Paused,
        }
        .to_xdr(&env, &_contract_id)]
    );
    assert_eq!(
        client.get_campaign(&campaign_id).unwrap().status,
        CampaignStatus::Paused
    );
    client.resume_campaign(&campaign_id, &merchant);
    assert_eq!(
        env.events().all(),
        std::vec![CampaignStatusChanged {
            campaign_id,
            merchant: merchant.clone(),
            previous: CampaignStatus::Paused,
            current: CampaignStatus::Active,
        }
        .to_xdr(&env, &_contract_id)]
    );
    assert_eq!(
        client.get_campaign(&campaign_id).unwrap().status,
        CampaignStatus::Active
    );

    assert_eq!(
        client.try_publish_campaign(&campaign_id, &merchant),
        Err(Ok(Error::InvalidState))
    );
    assert!(env.events().all().events().is_empty());
}

#[test]
fn status_changes_do_not_mutate_financial_rules() {
    let (env, _contract_id, client, _platform, _payment_asset) = setup();
    let merchant = Address::generate(&env);
    let terms = default_terms();
    let campaign_id = create(&client, &merchant, &terms);

    client.publish_campaign(&campaign_id, &merchant);
    client.pause_campaign(&campaign_id, &merchant);
    client.resume_campaign(&campaign_id, &merchant);

    let campaign = client.get_campaign(&campaign_id).unwrap();
    assert_eq!(campaign.pass_price, terms.pass_price);
    assert_eq!(campaign.service_value, terms.service_value);
    assert_eq!(campaign.max_supply, terms.max_supply);
    assert_eq!(campaign.expires_at, terms.expires_at);
    assert_eq!(campaign.financial_rules, terms.financial_rules);
}

#[test]
fn derives_expiration_from_ledger_time_and_blocks_transitions() {
    let (env, _contract_id, client, _platform, _payment_asset) = setup();
    let merchant = Address::generate(&env);
    let terms = default_terms();
    let campaign_id = create(&client, &merchant, &terms);
    client.publish_campaign(&campaign_id, &merchant);

    env.ledger().set_timestamp(terms.expires_at);

    assert_eq!(
        client.get_campaign(&campaign_id).unwrap().status,
        CampaignStatus::Expired
    );
    assert_eq!(
        client.try_pause_campaign(&campaign_id, &merchant),
        Err(Ok(Error::CampaignExpired))
    );
}

#[test]
fn reports_missing_campaigns() {
    let (_env, _contract_id, client, _platform, _payment_asset) = setup();

    assert_eq!(client.get_campaign(&404), None);
    assert_eq!(client.try_remaining_supply(&404), Err(Ok(Error::NotFound)));
}

#[test]
fn rejects_campaign_id_overflow() {
    let (env, contract_id, client, _platform, _payment_asset) = setup();
    let merchant = Address::generate(&env);
    env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .set(&DataKey::CampaignCount, &u64::MAX);
    });

    assert_eq!(
        client.try_create_campaign(&merchant, &default_terms()),
        Err(Ok(Error::Overflow))
    );
}
