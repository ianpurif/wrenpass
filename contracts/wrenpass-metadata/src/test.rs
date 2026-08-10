extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, Events as _, Ledger as _,
    },
    Address, BytesN, Env, Event, String as SorobanString,
};
use wrenpass_campaign::{
    CampaignTerms, FinancialRules as WrenPassFinancialRules, WrenPassContract,
    WrenPassContractClient,
};

const NOW: u64 = 1_000_000;

fn campaign_terms() -> CampaignTerms {
    CampaignTerms {
        pass_price: 50_000_000,
        service_value: 60_000_000,
        max_supply: 100,
        expires_at: NOW + 30 * 86_400,
        financial_rules: WrenPassFinancialRules {
            merchant_bps: 7_500,
            reserve_bps: 2_000,
            platform_fee_bps: 500,
        },
    }
}

fn setup() -> (
    Env,
    Address,
    WrenPassMetadataContractClient<'static>,
    WrenPassContractClient<'static>,
    Address,
) {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);
    env.mock_all_auths();

    let campaign_contract = env.register(WrenPassContract, ());
    let campaign_client = WrenPassContractClient::new(&env, &campaign_contract);
    let platform = Address::generate(&env);
    let payment_asset = Address::generate(&env);
    campaign_client.initialize(&platform, &payment_asset);

    let metadata_contract = env.register(WrenPassMetadataContract, ());
    let metadata_client = WrenPassMetadataContractClient::new(&env, &metadata_contract);
    let initializer = Address::generate(&env);
    metadata_client.initialize(&initializer, &campaign_contract);

    (
        env,
        metadata_contract,
        metadata_client,
        campaign_client,
        campaign_contract,
    )
}

fn profile_input(env: &Env) -> MerchantProfileInput {
    MerchantProfileInput {
        business_name: SorobanString::from_str(env, "Wren Studio"),
        description: SorobanString::from_str(
            env,
            "A neighborhood studio providing complete haircut services.",
        ),
        logo_sha256: Some(BytesN::from_array(env, &[7; 32])),
        logo_url: Some(SorobanString::from_str(
            env,
            "https://res.cloudinary.com/wrenpass/image/upload/logo.png",
        )),
    }
}

fn metadata_input(env: &Env, name: &str) -> CampaignMetadataInput {
    CampaignMetadataInput {
        image_sha256: Some(BytesN::from_array(env, &[9; 32])),
        image_url: Some(SorobanString::from_str(
            env,
            "https://res.cloudinary.com/wrenpass/image/upload/campaign.png",
        )),
        name: SorobanString::from_str(env, name),
        service_description: SorobanString::from_str(
            env,
            "One complete haircut service delivered at the merchant studio.",
        ),
    }
}

#[test]
fn initialization_is_authorized_and_immutable() {
    let env = Env::default();
    let metadata_contract = env.register(WrenPassMetadataContract, ());
    let client = WrenPassMetadataContractClient::new(&env, &metadata_contract);
    let initializer = Address::generate(&env);
    let campaign_contract = Address::generate(&env);

    assert!(client
        .try_initialize(&initializer, &campaign_contract)
        .is_err());
    env.mock_all_auths();
    client.initialize(&initializer, &campaign_contract);
    assert_eq!(client.storage_version(), CURRENT_STORAGE_VERSION);
    assert_eq!(client.get_config(), RegistryConfig { campaign_contract });
    assert_eq!(
        client.try_initialize(&initializer, &Address::generate(&env)),
        Err(Ok(Error::AlreadyInitialized))
    );
}

#[test]
fn stores_and_updates_an_authorized_merchant_profile() {
    let (env, contract_id, client, _campaign_client, _campaign_contract) = setup();
    let merchant = Address::generate(&env);
    let input = profile_input(&env);

    let stored = client.set_merchant_profile(&merchant, &input);
    let events = env.events().all().filter_by_contract(&contract_id);
    assert_eq!(stored.owner, merchant);
    assert_eq!(stored.created_at, NOW);
    assert_eq!(stored.updated_at, NOW);
    assert_eq!(client.get_merchant_profile(&merchant), Some(stored.clone()));
    assert_eq!(
        events,
        std::vec![MerchantProfileSet {
            merchant: merchant.clone(),
            updated_at: NOW,
        }
        .to_xdr(&env, &contract_id)]
    );

    env.ledger().set_timestamp(NOW + 60);
    let mut updated_input = input;
    updated_input.business_name = SorobanString::from_str(&env, "Wren Studio Manila");
    let updated = client.set_merchant_profile(&merchant, &updated_input);
    assert_eq!(updated.created_at, NOW);
    assert_eq!(updated.updated_at, NOW + 60);
    assert_eq!(updated.business_name, updated_input.business_name);
}

#[test]
fn rejects_invalid_or_unsigned_profiles() {
    let (env, _contract_id, client, _campaign_client, _campaign_contract) = setup();
    let merchant = Address::generate(&env);
    let mut input = profile_input(&env);
    input.business_name = SorobanString::from_str(&env, "W");
    assert_eq!(
        client.try_set_merchant_profile(&merchant, &input),
        Err(Ok(Error::InvalidBusinessName))
    );

    env.set_auths(&[]);
    assert!(client
        .try_set_merchant_profile(&merchant, &profile_input(&env))
        .is_err());
}

#[test]
fn verifies_campaign_ownership_and_keeps_metadata_immutable() {
    let (env, _contract_id, client, campaign_client, _campaign_contract) = setup();
    let merchant = Address::generate(&env);
    let wrong_merchant = Address::generate(&env);
    let campaign_id = campaign_client.create_campaign(&merchant, &campaign_terms());
    let input = metadata_input(&env, "Five haircuts forward");

    assert_eq!(
        client.try_register_campaign_metadata(&999, &merchant, &input),
        Err(Ok(Error::CampaignNotFound))
    );
    assert_eq!(
        client.try_register_campaign_metadata(&campaign_id, &wrong_merchant, &input),
        Err(Ok(Error::Unauthorized))
    );

    let stored = client.register_campaign_metadata(&campaign_id, &merchant, &input);
    assert_eq!(stored.campaign_id, campaign_id);
    assert_eq!(stored.merchant, merchant);
    assert_eq!(
        client.register_campaign_metadata(&campaign_id, &merchant, &input),
        stored
    );
    assert_eq!(client.merchant_campaign_count(&merchant), 1);

    assert_eq!(
        client.try_register_campaign_metadata(
            &campaign_id,
            &merchant,
            &metadata_input(&env, "Changed campaign"),
        ),
        Err(Ok(Error::MetadataConflict))
    );
}

#[test]
fn returns_campaign_metadata_with_stable_pagination() {
    let (env, _contract_id, client, campaign_client, _campaign_contract) = setup();
    let merchant = Address::generate(&env);
    let first_id = campaign_client.create_campaign(&merchant, &campaign_terms());
    let second_id = campaign_client.create_campaign(&merchant, &campaign_terms());
    let third_id = campaign_client.create_campaign(&merchant, &campaign_terms());
    client.register_campaign_metadata(
        &first_id,
        &merchant,
        &metadata_input(&env, "First campaign"),
    );
    client.register_campaign_metadata(
        &second_id,
        &merchant,
        &metadata_input(&env, "Second campaign"),
    );
    client.register_campaign_metadata(
        &third_id,
        &merchant,
        &metadata_input(&env, "Third campaign"),
    );

    assert_eq!(
        client
            .get_merchant_campaigns(&merchant, &0, &2)
            .iter()
            .map(|metadata| metadata.campaign_id)
            .collect::<std::vec::Vec<_>>(),
        std::vec![first_id, second_id]
    );
    assert_eq!(
        client
            .get_merchant_campaigns(&merchant, &2, &2)
            .get(0)
            .unwrap()
            .campaign_id,
        third_id
    );
    assert_eq!(
        client.try_get_merchant_campaigns(&merchant, &0, &0),
        Err(Ok(Error::InvalidPageSize))
    );
}

#[test]
fn extends_profile_campaign_and_index_ttl() {
    let (env, contract_id, client, campaign_client, _campaign_contract) = setup();
    let merchant = Address::generate(&env);
    client.set_merchant_profile(&merchant, &profile_input(&env));
    let campaign_id = campaign_client.create_campaign(&merchant, &campaign_terms());
    client.register_campaign_metadata(
        &campaign_id,
        &merchant,
        &metadata_input(&env, "Durable campaign"),
    );

    env.as_contract(&contract_id, || {
        assert!(env.storage().instance().get_ttl() >= STORAGE_TTL_EXTEND_TO_LEDGERS);
        for key in [
            DataKey::Merchant(merchant.clone()),
            DataKey::Campaign(campaign_id),
            DataKey::MerchantCampaignCount(merchant.clone()),
            DataKey::MerchantCampaign(merchant, 0),
            DataKey::CampaignIndex(campaign_id),
        ] {
            assert!(env.storage().persistent().get_ttl(&key) >= STORAGE_TTL_EXTEND_TO_LEDGERS);
        }
    });
}
