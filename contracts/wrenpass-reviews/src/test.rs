extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, Events as _, Ledger as _,
    },
    Address, Env, Event, String as SorobanString,
};

const NOW: u64 = 1_000_000;

fn setup() -> (Env, Address, WrenPassReviewsContractClient<'static>) {
    let env = Env::default();
    env.ledger().set_timestamp(NOW);
    env.mock_all_auths();
    let contract_id = env.register(WrenPassReviewsContract, ());
    let client = WrenPassReviewsContractClient::new(&env, &contract_id);
    (env, contract_id, client)
}

#[test]
fn stores_an_authorized_review_and_emits_an_event() {
    let (env, contract_id, client) = setup();
    let reviewer = Address::generate(&env);
    let message = SorobanString::from_str(&env, "A clear and trustworthy experience.");

    let review_id = client.submit_review(&reviewer, &5, &message);

    assert_eq!(review_id, 1);
    assert_eq!(
        env.events().all(),
        std::vec![ReviewSubmitted {
            review_id,
            reviewer: reviewer.clone(),
            rating: 5,
            message: message.clone(),
        }
        .to_xdr(&env, &contract_id)]
    );
    assert_eq!(client.review_count(), 1);
    assert_eq!(
        client.get_review(&review_id),
        Some(Review {
            id: review_id,
            reviewer: reviewer.clone(),
            rating: 5,
            message: message.clone(),
            created_at: NOW,
        })
    );
}

#[test]
fn extends_review_and_contract_storage_for_long_term_availability() {
    let (env, contract_id, client) = setup();
    let reviewer = Address::generate(&env);

    let review_id = client.submit_review(
        &reviewer,
        &5,
        &SorobanString::from_str(&env, "A durable on-chain review."),
    );

    env.as_contract(&contract_id, || {
        assert!(
            env.storage()
                .persistent()
                .get_ttl(&DataKey::Review(review_id))
                >= REVIEW_TTL_EXTEND_TO_LEDGERS
        );
        assert!(env.storage().instance().get_ttl() >= REVIEW_TTL_EXTEND_TO_LEDGERS);
    });
}

#[test]
fn requires_the_reviewer_wallet_authorization() {
    let env = Env::default();
    let contract_id = env.register(WrenPassReviewsContract, ());
    let client = WrenPassReviewsContractClient::new(&env, &contract_id);
    let reviewer = Address::generate(&env);
    let message = SorobanString::from_str(&env, "Worth recommending.");

    assert!(client.try_submit_review(&reviewer, &5, &message).is_err());
    assert_eq!(client.review_count(), 0);
}

#[test]
fn rejects_invalid_ratings_and_messages() {
    let (env, _contract_id, client) = setup();
    let reviewer = Address::generate(&env);
    let message = SorobanString::from_str(&env, "Useful service.");
    let empty = SorobanString::from_str(&env, "");
    let long_text = "x".repeat(501);
    let too_long = SorobanString::from_str(&env, &long_text);

    assert_eq!(
        client.try_submit_review(&reviewer, &0, &message),
        Err(Ok(Error::InvalidRating))
    );
    assert_eq!(
        client.try_submit_review(&reviewer, &6, &message),
        Err(Ok(Error::InvalidRating))
    );
    assert_eq!(
        client.try_submit_review(&reviewer, &5, &empty),
        Err(Ok(Error::InvalidMessage))
    );
    assert_eq!(
        client.try_submit_review(&reviewer, &5, &too_long),
        Err(Ok(Error::InvalidMessage))
    );
    assert_eq!(client.review_count(), 0);
}

#[test]
fn returns_newest_reviews_with_stable_cursor_pagination() {
    let (env, _contract_id, client) = setup();
    let reviewer = Address::generate(&env);

    for rating in 1..=5 {
        env.ledger().set_timestamp(NOW + u64::from(rating));
        client.submit_review(
            &reviewer,
            &rating,
            &SorobanString::from_str(&env, "Review message"),
        );
    }

    let first_page = client.get_reviews(&None, &2);
    assert_eq!(
        first_page
            .iter()
            .map(|review| review.id)
            .collect::<std::vec::Vec<_>>(),
        std::vec![5, 4]
    );

    let second_page = client.get_reviews(&Some(4), &2);
    assert_eq!(
        second_page
            .iter()
            .map(|review| review.id)
            .collect::<std::vec::Vec<_>>(),
        std::vec![3, 2]
    );
    assert!(client.get_reviews(&Some(1), &5).is_empty());
}

#[test]
fn rejects_unsafe_page_sizes() {
    let (_env, _contract_id, client) = setup();

    assert_eq!(
        client.try_get_reviews(&None, &0),
        Err(Ok(Error::InvalidPageSize))
    );
    assert_eq!(
        client.try_get_reviews(&None, &(MAX_REVIEW_PAGE_SIZE + 1)),
        Err(Ok(Error::InvalidPageSize))
    );
}
