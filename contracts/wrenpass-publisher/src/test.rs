extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, BytesN, Env, String as SorobanString,
};
use wrenpass_campaign::{CampaignStatus, WrenPassContract, WrenPassContractClient};
use wrenpass_metadata::{WrenPassMetadataContract, WrenPassMetadataContractClient};

const NOW: u64 = 1_000_000;

fn terms() -> CampaignTerms {
    CampaignTerms {
        expires_at: NOW + 30 * 86_400,
        financial_rules: FinancialRules {
            merchant_bps: 7_500,
            platform_fee_bps: 500,
            reserve_bps: 2_000,
        },
        max_supply: 100,
        pass_price: 50_000_000,
        service_value: 60_000_000,
    }
}

fn metadata(env: &Env) -> CampaignMetadataInput {
    CampaignMetadataInput {
        image_sha256: Some(BytesN::from_array(env, &[9; 32])),
        image_url: Some(SorobanString::from_str(
            env,
            "https://res.cloudinary.com/wrenpass/image/upload/campaign.png",
        )),
        name: SorobanString::from_str(env, "Five haircuts forward"),
        service_description: SorobanString::from_str(
            env,
            "One complete haircut service delivered at the merchant studio.",
        ),
    }
}

fn setup() -> (
    Env,
    WrenPassPublisherContractClient<'static>,
    WrenPassContractClient<'static>,
    WrenPassMetadataContractClient<'static>,
) {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);
    env.mock_all_auths();
    let initializer = Address::generate(&env);

    let campaign_contract = env.register(WrenPassContract, ());
    let campaign_client = WrenPassContractClient::new(&env, &campaign_contract);
    campaign_client.initialize(&initializer, &Address::generate(&env));

    let metadata_contract = env.register(WrenPassMetadataContract, ());
    let metadata_client = WrenPassMetadataContractClient::new(&env, &metadata_contract);
    metadata_client.initialize(&initializer, &campaign_contract);

    let publisher_contract = env.register(WrenPassPublisherContract, ());
    let publisher_client = WrenPassPublisherContractClient::new(&env, &publisher_contract);
    publisher_client.initialize(&initializer, &campaign_contract, &metadata_contract);

    (env, publisher_client, campaign_client, metadata_client)
}

#[test]
fn creates_metadata_and_publishes_atomically() {
    let (env, publisher, campaign, metadata_client) = setup();
    let merchant = Address::generate(&env);

    let campaign_id = publisher.create_and_publish_campaign(&merchant, &terms(), &metadata(&env));

    let stored_campaign = campaign.get_campaign(&campaign_id).unwrap();
    let stored_metadata = metadata_client.get_campaign_metadata(&campaign_id).unwrap();
    assert_eq!(stored_campaign.status, CampaignStatus::Active);
    assert_eq!(stored_campaign.merchant, merchant);
    assert_eq!(stored_metadata.campaign_id, campaign_id);
    assert_eq!(stored_metadata.merchant, merchant);
}

#[test]
fn rolls_back_campaign_when_metadata_is_invalid() {
    let (env, publisher, campaign, metadata_client) = setup();
    let merchant = Address::generate(&env);
    let mut invalid_metadata = metadata(&env);
    invalid_metadata.name = SorobanString::from_str(&env, "W");

    assert!(publisher
        .try_create_and_publish_campaign(&merchant, &terms(), &invalid_metadata)
        .is_err());
    assert_eq!(campaign.campaign_count(), 0);
    assert_eq!(metadata_client.merchant_campaign_count(&merchant), 0);
}

#[test]
fn requires_merchant_authorization() {
    let (env, publisher, campaign, _) = setup();
    let merchant = Address::generate(&env);
    env.set_auths(&[]);

    assert!(publisher
        .try_create_and_publish_campaign(&merchant, &terms(), &metadata(&env))
        .is_err());
    assert_eq!(campaign.campaign_count(), 0);
}
