#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, String, Vec,
};

const MAX_REVIEW_MESSAGE_BYTES: u32 = 500;
const MAX_REVIEW_PAGE_SIZE: u32 = 20;
const REVIEW_TTL_THRESHOLD_LEDGERS: u32 = 250_000;
const REVIEW_TTL_EXTEND_TO_LEDGERS: u32 = 500_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidRating = 1,
    InvalidMessage = 2,
    InvalidPageSize = 3,
    Overflow = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Review {
    pub id: u64,
    pub reviewer: Address,
    pub rating: u32,
    pub message: String,
    pub created_at: u64,
}

#[contracttype]
enum DataKey {
    ReviewCount,
    Review(u64),
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contractevent(topics = ["review_submitted"])]
pub struct ReviewSubmitted {
    #[topic]
    pub review_id: u64,
    #[topic]
    pub reviewer: Address,
    pub rating: u32,
    pub message: String,
}

#[contract]
pub struct WrenPassReviewsContract;

#[contractimpl]
impl WrenPassReviewsContract {
    pub fn submit_review(
        env: Env,
        reviewer: Address,
        rating: u32,
        message: String,
    ) -> Result<u64, Error> {
        if !(1..=5).contains(&rating) {
            return Err(Error::InvalidRating);
        }
        if message.is_empty() || message.len() > MAX_REVIEW_MESSAGE_BYTES {
            return Err(Error::InvalidMessage);
        }

        reviewer.require_auth();

        let current_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ReviewCount)
            .unwrap_or(0);
        let review_id = current_id.checked_add(1).ok_or(Error::Overflow)?;
        let review = Review {
            id: review_id,
            reviewer: reviewer.clone(),
            rating,
            message: message.clone(),
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .instance()
            .set(&DataKey::ReviewCount, &review_id);
        let review_key = DataKey::Review(review_id);
        env.storage().persistent().set(&review_key, &review);
        env.storage()
            .instance()
            .extend_ttl(REVIEW_TTL_THRESHOLD_LEDGERS, REVIEW_TTL_EXTEND_TO_LEDGERS);
        env.storage().persistent().extend_ttl(
            &review_key,
            REVIEW_TTL_THRESHOLD_LEDGERS,
            REVIEW_TTL_EXTEND_TO_LEDGERS,
        );

        ReviewSubmitted {
            review_id,
            reviewer,
            rating,
            message,
        }
        .publish(&env);

        Ok(review_id)
    }

    pub fn review_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ReviewCount)
            .unwrap_or(0)
    }

    pub fn get_review(env: Env, review_id: u64) -> Option<Review> {
        env.storage().persistent().get(&DataKey::Review(review_id))
    }

    pub fn get_reviews(env: Env, before_id: Option<u64>, limit: u32) -> Result<Vec<Review>, Error> {
        if limit == 0 || limit > MAX_REVIEW_PAGE_SIZE {
            return Err(Error::InvalidPageSize);
        }

        let count = Self::review_count(env.clone());
        let mut review_id = match before_id {
            Some(0) => return Ok(Vec::new(&env)),
            Some(before) => core::cmp::min(before - 1, count),
            None => count,
        };
        let mut reviews = Vec::new(&env);

        while review_id > 0 && reviews.len() < limit {
            if let Some(review) = Self::get_review(env.clone(), review_id) {
                reviews.push_back(review);
            }
            review_id -= 1;
        }

        Ok(reviews)
    }
}

#[cfg(test)]
mod test;
