extern crate std;

use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, AuthorizedFunction, AuthorizedInvocation, Events as _, Ledger as _, MockAuth,
        MockAuthInvoke,
    },
    token::{StellarAssetClient, TokenClient},
    Address, Env, Event, IntoVal, MuxedAddress, Symbol,
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
    let issuer = Address::generate(&env);
    let payment_asset = env.register_stellar_asset_contract_v2(issuer).address();
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
    assert_eq!(client.storage_version(), CURRENT_STORAGE_VERSION);
    let migration = client.index_migration_status();
    assert!(migration.campaigns_complete);
    assert!(migration.passes_complete);
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
    assert_eq!(campaign.refunded, 0);
    assert_eq!(campaign.merchant_released, 0);
    assert_eq!(campaign.protected_funds, 0);
    assert_eq!(campaign.platform_fees_paid, 0);
    assert_eq!(campaign.cancellation_shortfall, 0);
    assert_eq!(campaign.cancellation_funds, 0);
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

    let mut terms = default_terms();
    terms.pass_price = 1;
    terms.service_value = 2;
    assert_eq!(
        client.try_create_campaign(&merchant, &terms),
        Err(Ok(Error::InvalidFinancialRules))
    );

    let mut terms = default_terms();
    terms.pass_price = MAX_SAFE_PAYMENT_AMOUNT;
    terms.service_value = terms.pass_price + 1;
    terms.max_supply = 10_001;
    assert_eq!(
        client.try_create_campaign(&merchant, &terms),
        Err(Ok(Error::InvalidAmount))
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

fn active_campaign(
    max_supply: u32,
) -> (
    Env,
    Address,
    WrenPassContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
    u64,
) {
    let (env, contract_id, client, platform, payment_asset) = setup();
    let merchant = Address::generate(&env);
    let customer = Address::generate(&env);
    let mut terms = default_terms();
    terms.max_supply = max_supply;
    let campaign_id = create(&client, &merchant, &terms);
    client.publish_campaign(&campaign_id, &merchant);
    (
        env,
        contract_id,
        client,
        platform,
        payment_asset,
        merchant,
        customer,
        campaign_id,
    )
}

#[test]
fn quotes_exact_distribution_and_assigns_rounding_to_merchant() {
    let (env, _contract_id, client, _platform, _payment_asset) = setup();
    let merchant = Address::generate(&env);
    let mut terms = default_terms();
    terms.pass_price = 101;
    terms.service_value = 102;
    let campaign_id = create(&client, &merchant, &terms);

    assert_eq!(
        client.quote_purchase(&campaign_id),
        PurchaseAmounts {
            total: 101,
            merchant_release: 76,
            protected_reserve: 20,
            platform_fee: 5,
        }
    );
}

#[test]
fn distribution_always_matches_the_exact_price() {
    let rules = default_terms().financial_rules;
    for total in [20_i128, 21, 99, 100, 101, 10_000_001, 50_000_000] {
        let amounts = WrenPassContract::calculate_distribution(total, &rules).unwrap();
        assert_eq!(
            amounts.merchant_release + amounts.protected_reserve + amounts.platform_fee,
            total
        );
    }

    let no_fee = FinancialRules {
        merchant_bps: 8_000,
        reserve_bps: 2_000,
        platform_fee_bps: 0,
    };
    assert_eq!(
        WrenPassContract::calculate_distribution(5, &no_fee).unwrap(),
        PurchaseAmounts {
            total: 5,
            merchant_release: 4,
            protected_reserve: 1,
            platform_fee: 0,
        }
    );
}

#[test]
fn purchase_moves_configured_asset_assigns_pass_and_emits_event() {
    let (env, contract_id, client, platform, payment_asset, merchant, customer, campaign_id) =
        active_campaign(100);
    let token = TokenClient::new(&env, &payment_asset);
    let asset_admin = StellarAssetClient::new(&env, &payment_asset);
    let price = default_terms().pass_price;
    asset_admin.mint(&customer, &(price * 2));

    let pass_id = client.purchase(&campaign_id, &customer);

    assert_eq!(pass_id, 1);
    assert_eq!(
        env.events().all().filter_by_contract(&contract_id),
        std::vec![PassPurchased {
            campaign_id,
            pass_id,
            customer: customer.clone(),
            total: price,
            merchant_release: 37_500_000,
            protected_reserve: 10_000_000,
            platform_fee: 2_500_000,
        }
        .to_xdr(&env, &contract_id)]
    );
    assert_eq!(
        env.auths(),
        std::vec![(
            customer.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    contract_id.clone(),
                    symbol_short!("purchase"),
                    (campaign_id, customer.clone()).into_val(&env),
                )),
                sub_invocations: std::vec![
                    AuthorizedInvocation {
                        function: AuthorizedFunction::Contract((
                            payment_asset.clone(),
                            symbol_short!("transfer"),
                            (
                                customer.clone(),
                                MuxedAddress::from(&contract_id),
                                10_000_000_i128,
                            )
                                .into_val(&env),
                        )),
                        sub_invocations: std::vec![],
                    },
                    AuthorizedInvocation {
                        function: AuthorizedFunction::Contract((
                            payment_asset.clone(),
                            symbol_short!("transfer"),
                            (
                                customer.clone(),
                                MuxedAddress::from(&merchant),
                                37_500_000_i128,
                            )
                                .into_val(&env),
                        )),
                        sub_invocations: std::vec![],
                    },
                    AuthorizedInvocation {
                        function: AuthorizedFunction::Contract((
                            payment_asset.clone(),
                            symbol_short!("transfer"),
                            (
                                customer.clone(),
                                MuxedAddress::from(&platform),
                                2_500_000_i128,
                            )
                                .into_val(&env),
                        )),
                        sub_invocations: std::vec![],
                    },
                ],
            },
        )]
    );

    assert_eq!(token.balance(&customer), price);
    assert_eq!(token.balance(&merchant), 37_500_000);
    assert_eq!(token.balance(&contract_id), 10_000_000);
    assert_eq!(token.balance(&platform), 2_500_000);

    let campaign = client.get_campaign(&campaign_id).unwrap();
    assert_eq!(campaign.sold, 1);
    assert_eq!(campaign.merchant_released, 37_500_000);
    assert_eq!(campaign.protected_funds, 10_000_000);
    assert_eq!(campaign.platform_fees_paid, 2_500_000);
    assert_eq!(client.remaining_supply(&campaign_id), 99);
    assert_eq!(client.pass_count(), 1);
    assert_eq!(
        client.get_pass(&pass_id),
        Some(Pass {
            id: pass_id,
            campaign_id,
            owner: customer.clone(),
            status: PassStatus::Active,
            purchased_at: NOW,
            purchase_amounts: PurchaseAmounts {
                total: price,
                merchant_release: 37_500_000,
                protected_reserve: 10_000_000,
                platform_fee: 2_500_000,
            },
        })
    );
    assert_eq!(campaign.cancellation_shortfall, 40_000_000);
    assert_eq!(campaign.cancellation_funds, 0);
}

#[test]
fn rejects_insufficient_configured_asset_without_state_changes() {
    let (env, contract_id, client, _platform, payment_asset, _merchant, customer, campaign_id) =
        active_campaign(1);
    let token = TokenClient::new(&env, &payment_asset);
    let asset_admin = StellarAssetClient::new(&env, &payment_asset);
    let price = default_terms().pass_price;
    asset_admin.mint(&customer, &(price - 1));

    assert_eq!(
        client.try_purchase(&campaign_id, &customer),
        Err(Ok(Error::InsufficientBalance))
    );
    assert_eq!(token.balance(&customer), price - 1);
    assert_eq!(token.balance(&contract_id), 0);
    assert_eq!(client.pass_count(), 0);
    assert_eq!(client.get_campaign(&campaign_id).unwrap().sold, 0);
}

#[test]
fn funds_in_a_different_asset_cannot_buy_a_pass() {
    let (env, contract_id, client, _platform, configured_asset, _merchant, customer, campaign_id) =
        active_campaign(1);
    let wrong_issuer = Address::generate(&env);
    let wrong_asset = env
        .register_stellar_asset_contract_v2(wrong_issuer)
        .address();
    let wrong_admin = StellarAssetClient::new(&env, &wrong_asset);
    let wrong_token = TokenClient::new(&env, &wrong_asset);
    let configured_token = TokenClient::new(&env, &configured_asset);
    let price = default_terms().pass_price;
    wrong_admin.mint(&customer, &price);

    assert_eq!(
        client.try_purchase(&campaign_id, &customer),
        Err(Ok(Error::InsufficientBalance))
    );
    assert_eq!(wrong_token.balance(&customer), price);
    assert_eq!(configured_token.balance(&contract_id), 0);
    assert_eq!(client.pass_count(), 0);
}

#[test]
fn enforces_the_exact_supply_boundary() {
    let (env, _contract_id, client, _platform, payment_asset, _merchant, customer, campaign_id) =
        active_campaign(1);
    let token = TokenClient::new(&env, &payment_asset);
    let asset_admin = StellarAssetClient::new(&env, &payment_asset);
    let price = default_terms().pass_price;
    asset_admin.mint(&customer, &(price * 2));

    assert_eq!(client.purchase(&campaign_id, &customer), 1);
    assert_eq!(
        client.try_purchase(&campaign_id, &customer),
        Err(Ok(Error::SoldOut))
    );
    assert_eq!(token.balance(&customer), price);
    assert_eq!(client.pass_count(), 1);
    assert_eq!(client.remaining_supply(&campaign_id), 0);
    assert_eq!(client.get_campaign(&campaign_id).unwrap().sold, 1);
}

#[test]
fn paused_and_expired_campaigns_cannot_be_purchased() {
    let (env, _contract_id, client, _platform, payment_asset, merchant, customer, campaign_id) =
        active_campaign(2);
    let asset_admin = StellarAssetClient::new(&env, &payment_asset);
    let terms = default_terms();
    asset_admin.mint(&customer, &(terms.pass_price * 2));

    client.pause_campaign(&campaign_id, &merchant);
    assert_eq!(
        client.try_purchase(&campaign_id, &customer),
        Err(Ok(Error::InvalidState))
    );

    client.resume_campaign(&campaign_id, &merchant);
    env.ledger().set_timestamp(terms.expires_at);
    assert_eq!(
        client.try_purchase(&campaign_id, &customer),
        Err(Ok(Error::CampaignExpired))
    );
    assert_eq!(client.pass_count(), 0);
}

#[test]
fn purchase_requires_customer_authorization() {
    let (env, _contract_id, client, _platform, payment_asset, _merchant, customer, campaign_id) =
        active_campaign(1);
    let token = TokenClient::new(&env, &payment_asset);
    let asset_admin = StellarAssetClient::new(&env, &payment_asset);
    let price = default_terms().pass_price;
    asset_admin.mint(&customer, &price);
    env.set_auths(&[]);

    assert!(client.try_purchase(&campaign_id, &customer).is_err());
    assert_eq!(token.balance(&customer), price);
    assert_eq!(client.pass_count(), 0);
    assert_eq!(client.get_campaign(&campaign_id).unwrap().sold, 0);
}

#[test]
fn pass_ids_are_unique_across_campaigns_and_owners() {
    let (env, _contract_id, client, _platform, payment_asset) = setup();
    let merchant = Address::generate(&env);
    let first_customer = Address::generate(&env);
    let second_customer = Address::generate(&env);
    let first_campaign = create(&client, &merchant, &default_terms());
    let second_campaign = create(&client, &merchant, &default_terms());
    client.publish_campaign(&first_campaign, &merchant);
    client.publish_campaign(&second_campaign, &merchant);
    let asset_admin = StellarAssetClient::new(&env, &payment_asset);
    let price = default_terms().pass_price;
    asset_admin.mint(&first_customer, &price);
    asset_admin.mint(&second_customer, &price);

    let first_pass = client.purchase(&first_campaign, &first_customer);
    let second_pass = client.purchase(&second_campaign, &second_customer);

    assert_eq!(first_pass, 1);
    assert_eq!(second_pass, 2);
    assert_eq!(client.get_pass(&first_pass).unwrap().owner, first_customer);
    assert_eq!(
        client.get_pass(&second_pass).unwrap().owner,
        second_customer
    );
}

#[test]
fn rejects_pass_id_overflow_before_moving_funds() {
    let (env, contract_id, client, _platform, payment_asset, _merchant, customer, campaign_id) =
        active_campaign(1);
    let token = TokenClient::new(&env, &payment_asset);
    let asset_admin = StellarAssetClient::new(&env, &payment_asset);
    let price = default_terms().pass_price;
    asset_admin.mint(&customer, &price);
    env.as_contract(&contract_id, || {
        env.storage().instance().set(&DataKey::PassCount, &u64::MAX);
    });

    assert_eq!(
        client.try_purchase(&campaign_id, &customer),
        Err(Ok(Error::Overflow))
    );
    assert_eq!(token.balance(&customer), price);
    assert_eq!(client.get_campaign(&campaign_id).unwrap().sold, 0);
}

fn mint_and_purchase(
    env: &Env,
    client: &WrenPassContractClient,
    payment_asset: &Address,
    campaign_id: u64,
    customer: &Address,
) -> u64 {
    StellarAssetClient::new(env, payment_asset).mint(customer, &default_terms().pass_price);
    client.purchase(&campaign_id, customer)
}

#[test]
fn gifts_an_active_pass_without_creating_another_pass() {
    let (env, contract_id, client, _platform, payment_asset, _merchant, owner, campaign_id) =
        active_campaign(2);
    let recipient = Address::generate(&env);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);

    client.gift_pass(&pass_id, &owner, &recipient);
    let auths = env.auths();
    let events = env.events().all().filter_by_contract(&contract_id);

    assert_eq!(client.pass_count(), 1);
    assert_eq!(client.get_pass(&pass_id).unwrap().owner, recipient.clone());
    assert_eq!(
        auths,
        std::vec![(
            owner.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    contract_id.clone(),
                    symbol_short!("gift_pass"),
                    (pass_id, owner.clone(), recipient.clone()).into_val(&env),
                )),
                sub_invocations: std::vec![],
            },
        )]
    );
    assert_eq!(
        events,
        std::vec![PassGifted {
            campaign_id,
            pass_id,
            previous_owner: owner,
            recipient,
        }
        .to_xdr(&env, &contract_id)]
    );
}

#[test]
fn rejects_gifts_from_non_owners_and_to_the_same_owner() {
    let (env, _contract_id, client, _platform, payment_asset, _merchant, owner, campaign_id) =
        active_campaign(1);
    let other = Address::generate(&env);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);

    assert_eq!(
        client.try_gift_pass(&pass_id, &other, &owner),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        client.try_gift_pass(&pass_id, &owner, &owner),
        Err(Ok(Error::InvalidRecipient))
    );
    env.set_auths(&[]);
    assert!(client.try_gift_pass(&pass_id, &owner, &other).is_err());
    assert_eq!(client.get_pass(&pass_id).unwrap().owner, owner);
}

#[test]
fn redemption_requires_the_campaign_merchant_and_current_owner() {
    let (env, contract_id, client, _platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(1);
    let wrong_merchant = Address::generate(&env);
    let wrong_owner = Address::generate(&env);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);

    assert_eq!(
        client.try_redeem_pass(&pass_id, &wrong_merchant, &owner),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        client.try_redeem_pass(&pass_id, &merchant, &wrong_owner),
        Err(Ok(Error::Unauthorized))
    );

    env.mock_auths(&[MockAuth {
        address: &merchant,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "redeem_pass",
            args: (pass_id, merchant.clone(), owner.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_redeem_pass(&pass_id, &merchant, &owner).is_err());
    assert_eq!(
        client.get_pass(&pass_id).unwrap().status,
        PassStatus::Active
    );

    env.mock_auths(&[MockAuth {
        address: &owner,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "redeem_pass",
            args: (pass_id, merchant.clone(), owner.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(client.try_redeem_pass(&pass_id, &merchant, &owner).is_err());
    assert_eq!(
        client.get_pass(&pass_id).unwrap().status,
        PassStatus::Active
    );
}

#[test]
fn redemption_releases_the_reserve_and_cannot_happen_twice() {
    let (env, contract_id, client, _platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(1);
    let token = TokenClient::new(&env, &payment_asset);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);

    client.redeem_pass(&pass_id, &merchant, &owner);
    let auths = env.auths();
    let events = env.events().all().filter_by_contract(&contract_id);

    assert_eq!(
        client.get_pass(&pass_id).unwrap().status,
        PassStatus::Redeemed
    );
    assert_eq!(token.balance(&contract_id), 0);
    assert_eq!(token.balance(&merchant), 47_500_000);
    let campaign = client.get_campaign(&campaign_id).unwrap();
    assert_eq!(campaign.redeemed, 1);
    assert_eq!(campaign.refunded, 0);
    assert_eq!(campaign.merchant_released, 47_500_000);
    assert_eq!(campaign.protected_funds, 0);
    assert_eq!(campaign.cancellation_shortfall, 0);
    let redeem_invocation = AuthorizedInvocation {
        function: AuthorizedFunction::Contract((
            contract_id.clone(),
            Symbol::new(&env, "redeem_pass"),
            (pass_id, merchant.clone(), owner.clone()).into_val(&env),
        )),
        sub_invocations: std::vec![],
    };
    assert_eq!(
        auths,
        std::vec![
            (merchant.clone(), redeem_invocation.clone()),
            (owner.clone(), redeem_invocation),
        ]
    );
    assert_eq!(
        events,
        std::vec![PassRedeemed {
            campaign_id,
            pass_id,
            owner: owner.clone(),
            merchant: merchant.clone(),
            reserve_released: 10_000_000,
        }
        .to_xdr(&env, &contract_id)]
    );
    assert_eq!(
        client.try_redeem_pass(&pass_id, &merchant, &owner),
        Err(Ok(Error::PassNotActive))
    );
}

#[test]
fn a_failed_token_release_rolls_back_redemption_state() {
    let (env, contract_id, client, _platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(1);
    let token = TokenClient::new(&env, &payment_asset);
    let asset_admin = StellarAssetClient::new(&env, &payment_asset);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);
    let merchant_balance = token.balance(&merchant);
    asset_admin.mint(&merchant, &(i128::MAX - merchant_balance));

    assert!(client.try_redeem_pass(&pass_id, &merchant, &owner).is_err());

    assert_eq!(
        client.get_pass(&pass_id).unwrap().status,
        PassStatus::Active
    );
    let campaign = client.get_campaign(&campaign_id).unwrap();
    assert_eq!(campaign.redeemed, 0);
    assert_eq!(campaign.merchant_released, 37_500_000);
    assert_eq!(campaign.protected_funds, 10_000_000);
    assert_eq!(campaign.cancellation_shortfall, 40_000_000);
    assert_eq!(token.balance(&contract_id), 10_000_000);
    assert_eq!(token.balance(&merchant), i128::MAX);
}

#[test]
fn pausing_sales_does_not_block_gifting_or_fulfillment() {
    let (env, _contract_id, client, _platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(1);
    let recipient = Address::generate(&env);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);
    client.pause_campaign(&campaign_id, &merchant);

    client.gift_pass(&pass_id, &owner, &recipient);
    client.redeem_pass(&pass_id, &merchant, &recipient);

    assert_eq!(
        client.get_campaign(&campaign_id).unwrap().status,
        CampaignStatus::Paused
    );
    assert_eq!(
        client.get_pass(&pass_id).unwrap().status,
        PassStatus::Redeemed
    );
}

#[test]
fn redeemed_and_expired_passes_cannot_be_gifted_or_redeemed() {
    let (env, _contract_id, client, _platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(2);
    let recipient = Address::generate(&env);
    let redeemed_pass = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);
    client.redeem_pass(&redeemed_pass, &merchant, &owner);
    assert_eq!(
        client.try_gift_pass(&redeemed_pass, &owner, &recipient),
        Err(Ok(Error::PassNotActive))
    );

    let expired_owner = Address::generate(&env);
    let expired_pass =
        mint_and_purchase(&env, &client, &payment_asset, campaign_id, &expired_owner);
    env.ledger().set_timestamp(default_terms().expires_at);
    assert_eq!(
        client.get_pass(&expired_pass).unwrap().status,
        PassStatus::Expired
    );
    assert_eq!(
        client.try_gift_pass(&expired_pass, &expired_owner, &recipient),
        Err(Ok(Error::PassExpired))
    );
    assert_eq!(
        client.try_redeem_pass(&expired_pass, &merchant, &expired_owner),
        Err(Ok(Error::PassExpired))
    );
}

#[test]
fn expiration_allows_only_the_protected_reserve_to_be_refunded() {
    let (env, contract_id, client, _platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(1);
    let token = TokenClient::new(&env, &payment_asset);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);

    assert_eq!(
        client.try_refund_pass(&pass_id, &owner),
        Err(Ok(Error::RefundNotAvailable))
    );
    env.ledger().set_timestamp(default_terms().expires_at);
    env.set_auths(&[]);
    assert!(client.try_refund_pass(&pass_id, &owner).is_err());
    assert_eq!(client.get_campaign(&campaign_id).unwrap().refunded, 0);
    env.mock_all_auths();
    assert_eq!(client.refund_pass(&pass_id, &owner), 10_000_000);
    let auths = env.auths();
    let events = env.events().all().filter_by_contract(&contract_id);

    assert_eq!(
        client.get_pass(&pass_id).unwrap().status,
        PassStatus::Refunded
    );
    assert_eq!(token.balance(&owner), 10_000_000);
    assert_eq!(token.balance(&merchant), 37_500_000);
    assert_eq!(token.balance(&contract_id), 0);
    let campaign = client.get_campaign(&campaign_id).unwrap();
    assert_eq!(campaign.status, CampaignStatus::Expired);
    assert_eq!(campaign.refunded, 1);
    assert_eq!(campaign.protected_funds, 0);
    assert_eq!(campaign.cancellation_shortfall, 0);
    assert_eq!(
        auths,
        std::vec![(
            owner.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    contract_id.clone(),
                    Symbol::new(&env, "refund_pass"),
                    (pass_id, owner.clone()).into_val(&env),
                )),
                sub_invocations: std::vec![],
            },
        )]
    );
    assert_eq!(
        events,
        std::vec![PassRefunded {
            campaign_id,
            pass_id,
            owner: owner.clone(),
            amount: 10_000_000,
            full_refund: false,
        }
        .to_xdr(&env, &contract_id)]
    );
    assert_eq!(
        client.try_refund_pass(&pass_id, &owner),
        Err(Ok(Error::PassNotActive))
    );
    let recipient = Address::generate(&env);
    assert_eq!(
        client.try_gift_pass(&pass_id, &owner, &recipient),
        Err(Ok(Error::PassNotActive))
    );
}

#[test]
fn cancellation_requires_full_replenishment_before_full_refunds() {
    let (env, contract_id, client, platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(1);
    let token = TokenClient::new(&env, &payment_asset);
    let asset_admin = StellarAssetClient::new(&env, &payment_asset);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);

    assert_eq!(
        client.try_cancel_campaign(&campaign_id, &merchant),
        Err(Ok(Error::InsufficientBalance))
    );
    assert_eq!(
        client.get_campaign(&campaign_id).unwrap().status,
        CampaignStatus::Active
    );
    assert_eq!(token.balance(&contract_id), 10_000_000);

    asset_admin.mint(&merchant, &2_500_000);
    assert_eq!(client.cancel_campaign(&campaign_id, &merchant), 40_000_000);
    let auths = env.auths();
    let events = env.events().all().filter_by_contract(&contract_id);
    let cancelled = client.get_campaign(&campaign_id).unwrap();
    assert_eq!(cancelled.status, CampaignStatus::Cancelled);
    assert_eq!(cancelled.cancellation_shortfall, 40_000_000);
    assert_eq!(cancelled.cancellation_funds, 40_000_000);
    assert_eq!(token.balance(&contract_id), 50_000_000);
    assert_eq!(token.balance(&merchant), 0);
    assert_eq!(token.balance(&platform), 2_500_000);
    assert_eq!(
        auths,
        std::vec![(
            merchant.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    contract_id.clone(),
                    Symbol::new(&env, "cancel_campaign"),
                    (campaign_id, merchant.clone()).into_val(&env),
                )),
                sub_invocations: std::vec![AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        payment_asset.clone(),
                        symbol_short!("transfer"),
                        (
                            merchant.clone(),
                            MuxedAddress::from(&contract_id),
                            40_000_000_i128,
                        )
                            .into_val(&env),
                    )),
                    sub_invocations: std::vec![],
                }],
            },
        )]
    );
    assert_eq!(
        events,
        std::vec![CampaignCancelled {
            campaign_id,
            merchant: merchant.clone(),
            replenished: 40_000_000,
        }
        .to_xdr(&env, &contract_id)]
    );

    assert_eq!(client.refund_pass(&pass_id, &owner), 50_000_000);
    assert_eq!(token.balance(&owner), 50_000_000);
    assert_eq!(token.balance(&contract_id), 0);
    let refunded = client.get_campaign(&campaign_id).unwrap();
    assert_eq!(refunded.refunded, 1);
    assert_eq!(refunded.protected_funds, 0);
    assert_eq!(refunded.cancellation_shortfall, 0);
    assert_eq!(refunded.cancellation_funds, 0);
}

#[test]
fn cancellation_is_merchant_only_pre_expiry_and_blocks_active_pass_actions() {
    let (env, _contract_id, client, _platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(1);
    let other = Address::generate(&env);
    let recipient = Address::generate(&env);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);
    StellarAssetClient::new(&env, &payment_asset).mint(&merchant, &2_500_000);

    assert_eq!(
        client.try_cancel_campaign(&campaign_id, &other),
        Err(Ok(Error::Unauthorized))
    );
    env.set_auths(&[]);
    assert!(client.try_cancel_campaign(&campaign_id, &merchant).is_err());
    assert_eq!(
        client.get_campaign(&campaign_id).unwrap().status,
        CampaignStatus::Active
    );
    env.mock_all_auths();
    client.cancel_campaign(&campaign_id, &merchant);
    assert_eq!(
        client.try_purchase(&campaign_id, &owner),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        client.try_gift_pass(&pass_id, &owner, &recipient),
        Err(Ok(Error::InvalidState))
    );
    assert_eq!(
        client.try_redeem_pass(&pass_id, &merchant, &owner),
        Err(Ok(Error::InvalidState))
    );

    let (env, _contract_id, client, _platform, _payment_asset, merchant, _owner, campaign_id) =
        active_campaign(1);
    env.ledger().set_timestamp(default_terms().expires_at);
    assert_eq!(
        client.try_cancel_campaign(&campaign_id, &merchant),
        Err(Ok(Error::CampaignExpired))
    );
}

#[test]
fn redeemed_passes_are_excluded_from_the_cancellation_requirement() {
    let (env, contract_id, client, _platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(1);
    let token = TokenClient::new(&env, &payment_asset);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);
    client.redeem_pass(&pass_id, &merchant, &owner);

    assert_eq!(client.cancel_campaign(&campaign_id, &merchant), 0);
    let campaign = client.get_campaign(&campaign_id).unwrap();
    assert_eq!(campaign.status, CampaignStatus::Cancelled);
    assert_eq!(campaign.cancellation_shortfall, 0);
    assert_eq!(campaign.cancellation_funds, 0);
    assert_eq!(token.balance(&contract_id), 0);
    assert_eq!(
        client.try_refund_pass(&pass_id, &owner),
        Err(Ok(Error::PassNotActive))
    );
}

#[test]
fn the_current_owner_after_a_gift_receives_the_refund() {
    let (env, _contract_id, client, _platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(1);
    let recipient = Address::generate(&env);
    let token = TokenClient::new(&env, &payment_asset);
    let asset_admin = StellarAssetClient::new(&env, &payment_asset);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);
    client.gift_pass(&pass_id, &owner, &recipient);
    asset_admin.mint(&merchant, &2_500_000);
    client.cancel_campaign(&campaign_id, &merchant);

    assert_eq!(
        client.try_refund_pass(&pass_id, &owner),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(client.refund_pass(&pass_id, &recipient), 50_000_000);
    assert_eq!(token.balance(&owner), 0);
    assert_eq!(token.balance(&recipient), 50_000_000);
}

#[test]
fn indexes_campaigns_by_merchant_with_stable_pagination() {
    let (env, _contract_id, client, _platform, _payment_asset) = setup();
    let merchant = Address::generate(&env);
    let other_merchant = Address::generate(&env);

    let first_id = create(&client, &merchant, &default_terms());
    create(&client, &other_merchant, &default_terms());
    let second_id = create(&client, &merchant, &default_terms());

    assert_eq!(client.merchant_campaign_count(&merchant), 2);
    assert_eq!(
        client
            .get_merchant_campaigns(&merchant, &0, &1)
            .iter()
            .map(|campaign| campaign.id)
            .collect::<std::vec::Vec<_>>(),
        std::vec![first_id]
    );
    assert_eq!(
        client
            .get_merchant_campaigns(&merchant, &1, &2)
            .iter()
            .map(|campaign| campaign.id)
            .collect::<std::vec::Vec<_>>(),
        std::vec![second_id]
    );
    assert_eq!(
        client.try_get_merchant_campaigns(&merchant, &0, &0),
        Err(Ok(Error::InvalidPageSize))
    );
    assert_eq!(
        client.try_get_merchant_campaigns(&merchant, &0, &(MAX_INDEX_PAGE_SIZE + 1)),
        Err(Ok(Error::InvalidPageSize))
    );
}

#[test]
fn owner_pass_index_tracks_purchases_gifts_and_terminal_states() {
    let (env, _contract_id, client, _platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(3);
    let recipient = Address::generate(&env);
    let first_pass = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);
    let second_pass = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);

    assert_eq!(client.owner_pass_count(&owner), 2);
    client.gift_pass(&first_pass, &owner, &recipient);

    assert_eq!(client.owner_pass_count(&owner), 1);
    assert_eq!(client.owner_pass_count(&recipient), 1);
    assert_eq!(
        client
            .get_owner_passes(&owner, &0, &MAX_INDEX_PAGE_SIZE)
            .iter()
            .map(|pass| pass.id)
            .collect::<std::vec::Vec<_>>(),
        std::vec![second_pass]
    );
    assert_eq!(
        client
            .get_owner_passes(&recipient, &0, &MAX_INDEX_PAGE_SIZE)
            .iter()
            .map(|pass| pass.id)
            .collect::<std::vec::Vec<_>>(),
        std::vec![first_pass]
    );

    client.redeem_pass(&second_pass, &merchant, &owner);
    let owner_passes = client.get_owner_passes(&owner, &0, &MAX_INDEX_PAGE_SIZE);
    assert_eq!(owner_passes.len(), 1);
    assert_eq!(owner_passes.get(0).unwrap().status, PassStatus::Redeemed);
    assert_eq!(client.pass_count(), 2);
}

#[test]
fn incrementally_migrates_legacy_records_without_changing_core_state() {
    let (env, contract_id, client, _platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(2);
    let first_pass = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);
    let second_pass = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);
    let campaign_before = client.get_campaign(&campaign_id).unwrap();
    let first_pass_before = client.get_pass(&first_pass).unwrap();

    env.as_contract(&contract_id, || {
        env.storage().instance().remove(&DataKey::StorageVersion);
        env.storage()
            .instance()
            .remove(&DataKey::CampaignIndexCursor);
        env.storage().instance().remove(&DataKey::PassIndexCursor);
        env.storage()
            .persistent()
            .remove(&DataKey::MerchantCampaignCount(merchant.clone()));
        env.storage()
            .persistent()
            .remove(&DataKey::MerchantCampaign(merchant.clone(), 0));
        env.storage()
            .persistent()
            .remove(&DataKey::CampaignIndex(campaign_id));
        env.storage()
            .persistent()
            .remove(&DataKey::OwnerPassCount(owner.clone()));
        env.storage()
            .persistent()
            .remove(&DataKey::OwnerPass(owner.clone(), 0));
        env.storage()
            .persistent()
            .remove(&DataKey::OwnerPass(owner.clone(), 1));
        env.storage()
            .persistent()
            .remove(&DataKey::PassOwnerIndex(first_pass));
        env.storage()
            .persistent()
            .remove(&DataKey::PassOwnerIndex(second_pass));
    });

    assert_eq!(client.storage_version(), LEGACY_STORAGE_VERSION);
    assert_eq!(client.merchant_campaign_count(&merchant), 0);
    assert_eq!(client.owner_pass_count(&owner), 0);

    let campaign_status = client.migrate_campaign_index(&1);
    assert!(campaign_status.campaigns_complete);
    assert!(!campaign_status.passes_complete);
    assert_eq!(client.storage_version(), LEGACY_STORAGE_VERSION);
    assert_eq!(client.merchant_campaign_count(&merchant), 1);

    let first_pass_status = client.migrate_pass_index(&1);
    assert!(!first_pass_status.passes_complete);
    assert_eq!(client.owner_pass_count(&owner), 1);
    let complete = client.migrate_pass_index(&1);
    assert!(complete.campaigns_complete);
    assert!(complete.passes_complete);
    assert_eq!(client.storage_version(), CURRENT_STORAGE_VERSION);
    assert_eq!(client.owner_pass_count(&owner), 2);

    client.migrate_campaign_index(&MAX_INDEX_PAGE_SIZE);
    client.migrate_pass_index(&MAX_INDEX_PAGE_SIZE);
    assert_eq!(client.merchant_campaign_count(&merchant), 1);
    assert_eq!(client.owner_pass_count(&owner), 2);
    assert_eq!(client.get_campaign(&campaign_id).unwrap(), campaign_before);
    assert_eq!(client.get_pass(&first_pass).unwrap(), first_pass_before);
}

#[test]
fn gifting_a_legacy_pass_repairs_its_owner_index_without_duplication() {
    let (env, contract_id, client, _platform, payment_asset, _merchant, owner, campaign_id) =
        active_campaign(1);
    let recipient = Address::generate(&env);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);

    env.as_contract(&contract_id, || {
        env.storage().instance().remove(&DataKey::StorageVersion);
        env.storage().instance().remove(&DataKey::PassIndexCursor);
        env.storage()
            .persistent()
            .remove(&DataKey::OwnerPassCount(owner.clone()));
        env.storage()
            .persistent()
            .remove(&DataKey::OwnerPass(owner.clone(), 0));
        env.storage()
            .persistent()
            .remove(&DataKey::PassOwnerIndex(pass_id));
    });

    client.gift_pass(&pass_id, &owner, &recipient);
    assert_eq!(client.owner_pass_count(&owner), 0);
    assert_eq!(client.owner_pass_count(&recipient), 1);
    assert_eq!(
        client
            .get_owner_passes(&recipient, &0, &MAX_INDEX_PAGE_SIZE)
            .get(0)
            .unwrap()
            .id,
        pass_id
    );

    client.migrate_pass_index(&MAX_INDEX_PAGE_SIZE);
    assert_eq!(client.owner_pass_count(&recipient), 1);
}

#[test]
fn extends_core_and_index_storage_ttl_when_records_are_written() {
    let (env, contract_id, client, _platform, payment_asset, merchant, owner, campaign_id) =
        active_campaign(1);
    let pass_id = mint_and_purchase(&env, &client, &payment_asset, campaign_id, &owner);

    env.as_contract(&contract_id, || {
        assert!(env.storage().instance().get_ttl() >= STORAGE_TTL_EXTEND_TO_LEDGERS);
        for key in [
            DataKey::Campaign(campaign_id),
            DataKey::MerchantCampaignCount(merchant.clone()),
            DataKey::MerchantCampaign(merchant, 0),
            DataKey::CampaignIndex(campaign_id),
            DataKey::Pass(pass_id),
            DataKey::OwnerPassCount(owner.clone()),
            DataKey::OwnerPass(owner.clone(), 0),
            DataKey::PassOwnerIndex(pass_id),
        ] {
            assert!(env.storage().persistent().get_ttl(&key) >= STORAGE_TTL_EXTEND_TO_LEDGERS);
        }
    });
}
