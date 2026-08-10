#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env, String,
};

#[contract]
struct CampaignStub;

#[contracttype]
enum StubKey {
    Campaign(u64),
    Pass(u64),
}

#[contractimpl]
impl CampaignStub {
    pub fn get_pass(env: Env, pass_id: u64) -> Option<PassSnapshot> {
        env.storage().instance().get(&StubKey::Pass(pass_id))
    }

    pub fn get_campaign(env: Env, campaign_id: u64) -> Option<CampaignSnapshot> {
        env.storage()
            .instance()
            .get(&StubKey::Campaign(campaign_id))
    }

    pub fn set_pass(env: Env, pass: PassSnapshot) {
        env.storage().instance().set(&StubKey::Pass(pass.id), &pass);
    }

    pub fn set_campaign(env: Env, campaign: CampaignSnapshot) {
        env.storage()
            .instance()
            .set(&StubKey::Campaign(campaign.id), &campaign);
    }
}

struct Fixture {
    env: Env,
    client: WrenPassRedemptionsContractClient<'static>,
    campaign_client: CampaignStubClient<'static>,
    merchant: Address,
    owner: Address,
}

fn fixture() -> Fixture {
    let env = Env::default();
    env.ledger().with_mut(|ledger| {
        ledger.sequence_number = 1_000;
        ledger.timestamp = 1_786_261_200;
    });
    let campaign_id = env.register(CampaignStub, ());
    let contract_id = env.register(WrenPassRedemptionsContract, ());
    let initializer = Address::generate(&env);
    let merchant = Address::generate(&env);
    let owner = Address::generate(&env);
    let client = WrenPassRedemptionsContractClient::new(&env, &contract_id);
    let campaign_client = CampaignStubClient::new(&env, &campaign_id);

    env.mock_all_auths();
    client.initialize(&initializer, &campaign_id);
    campaign_client.set_campaign(&CampaignSnapshot {
        id: 1,
        merchant: merchant.clone(),
        platform: Address::generate(&env),
        payment_asset: Address::generate(&env),
        pass_price: 50_000_000,
        service_value: 60_000_000,
        max_supply: 100,
        sold: 1,
        redeemed: 0,
        refunded: 0,
        merchant_released: 37_500_000,
        protected_funds: 10_000_000,
        platform_fees_paid: 2_500_000,
        cancellation_shortfall: 37_500_000,
        cancellation_funds: 0,
        expires_at: 1_794_121_200,
        financial_rules: FinancialRules {
            merchant_bps: 7_500,
            reserve_bps: 2_000,
            platform_fee_bps: 500,
        },
        status: CampaignStatus::Active,
        created_at: 1_786_261_100,
    });
    campaign_client.set_pass(&PassSnapshot {
        id: 1,
        campaign_id: 1,
        owner: owner.clone(),
        status: PassStatus::Active,
        purchased_at: 1_786_261_200,
        purchase_amounts: PurchaseAmounts {
            total: 50_000_000,
            merchant_release: 37_500_000,
            protected_reserve: 10_000_000,
            platform_fee: 2_500_000,
        },
    });

    Fixture {
        env,
        client,
        campaign_client,
        merchant,
        owner,
    }
}

fn transaction(env: &Env, suffix: &str) -> String {
    String::from_str(env, suffix)
}

#[test]
fn initialization_is_authorized_and_immutable() {
    let env = Env::default();
    let contract_id = env.register(WrenPassRedemptionsContract, ());
    let campaign_id = Address::generate(&env);
    let initializer = Address::generate(&env);
    let client = WrenPassRedemptionsContractClient::new(&env, &contract_id);

    assert!(client.try_initialize(&initializer, &campaign_id).is_err());
    env.mock_all_auths();
    client.initialize(&initializer, &campaign_id);
    assert_eq!(client.storage_version(), 1);
    assert_eq!(client.get_config().campaign_contract, campaign_id);
    assert_eq!(
        client.try_initialize(&initializer, &campaign_id),
        Err(Ok(Error::AlreadyInitialized))
    );
}

#[test]
fn stores_only_a_campaign_merchants_active_pass_request() {
    let fixture = fixture();
    let request = fixture.client.create_request(
        &fixture.merchant,
        &fixture.owner,
        &1,
        &transaction(&fixture.env, "signed-redemption"),
        &1_060,
    );

    assert_eq!(request.pass_id, 1);
    assert_eq!(request.campaign_id, 1);
    assert_eq!(request.merchant, fixture.merchant);
    assert_eq!(request.owner, fixture.owner);
    assert_eq!(fixture.client.get_request(&1), Some(request.clone()));
    let page = fixture.client.get_owner_requests(&fixture.owner, &0, &10);
    assert_eq!(page.requests, soroban_sdk::vec![&fixture.env, request]);
    assert_eq!(page.next_cursor, 1);
}

#[test]
fn rejects_unsigned_wrong_owner_and_wrong_merchant_requests() {
    let fixture = fixture();
    fixture.env.set_auths(&[]);
    assert!(fixture
        .client
        .try_create_request(
            &fixture.merchant,
            &fixture.owner,
            &1,
            &transaction(&fixture.env, "signed-redemption"),
            &1_060,
        )
        .is_err());

    fixture.env.mock_all_auths();
    let wrong = Address::generate(&fixture.env);
    assert_eq!(
        fixture.client.try_create_request(
            &fixture.merchant,
            &wrong,
            &1,
            &transaction(&fixture.env, "signed-redemption"),
            &1_060,
        ),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        fixture.client.try_create_request(
            &wrong,
            &fixture.owner,
            &1,
            &transaction(&fixture.env, "signed-redemption"),
            &1_060,
        ),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn rejects_invalid_payload_expiration_and_terminal_passes() {
    let fixture = fixture();
    assert_eq!(
        fixture.client.try_create_request(
            &fixture.merchant,
            &fixture.owner,
            &1,
            &transaction(&fixture.env, ""),
            &1_060,
        ),
        Err(Ok(Error::InvalidTransaction))
    );
    assert_eq!(
        fixture.client.try_create_request(
            &fixture.merchant,
            &fixture.owner,
            &1,
            &transaction(&fixture.env, "signed-redemption"),
            &999,
        ),
        Err(Ok(Error::InvalidExpiration))
    );
    assert_eq!(
        fixture.client.try_create_request(
            &fixture.merchant,
            &fixture.owner,
            &1,
            &transaction(&fixture.env, "signed-redemption"),
            &1_121,
        ),
        Err(Ok(Error::InvalidExpiration))
    );

    fixture.campaign_client.set_pass(&PassSnapshot {
        status: PassStatus::Redeemed,
        ..fixture.campaign_client.get_pass(&1).unwrap()
    });
    assert_eq!(
        fixture.client.try_create_request(
            &fixture.merchant,
            &fixture.owner,
            &1,
            &transaction(&fixture.env, "signed-redemption"),
            &1_060,
        ),
        Err(Ok(Error::PassNotActive))
    );
}

#[test]
fn replaces_a_pass_request_without_duplicating_the_owner_index() {
    let fixture = fixture();
    fixture.client.create_request(
        &fixture.merchant,
        &fixture.owner,
        &1,
        &transaction(&fixture.env, "first"),
        &1_050,
    );
    fixture.client.create_request(
        &fixture.merchant,
        &fixture.owner,
        &1,
        &transaction(&fixture.env, "second"),
        &1_060,
    );

    assert_eq!(fixture.client.owner_request_count(&fixture.owner), 1);
    let requests = fixture
        .client
        .get_owner_requests(&fixture.owner, &0, &10)
        .requests;
    assert_eq!(requests.len(), 1);
    assert_eq!(
        requests.get(0).unwrap().serialized_transaction,
        transaction(&fixture.env, "second")
    );
}

#[test]
fn filters_expired_requests_and_validates_page_sizes() {
    let fixture = fixture();
    fixture.client.create_request(
        &fixture.merchant,
        &fixture.owner,
        &1,
        &transaction(&fixture.env, "signed-redemption"),
        &1_001,
    );
    fixture
        .env
        .ledger()
        .with_mut(|ledger| ledger.sequence_number = 1_001);

    assert_eq!(fixture.client.get_request(&1), None);
    assert!(fixture
        .client
        .get_owner_requests(&fixture.owner, &0, &10)
        .requests
        .is_empty());
    assert_eq!(
        fixture
            .client
            .try_get_owner_requests(&fixture.owner, &0, &0),
        Err(Ok(Error::InvalidPageSize))
    );
}
