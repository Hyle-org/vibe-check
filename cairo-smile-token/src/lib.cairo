use core::option::OptionTrait;
use core::traits::TryInto;
use core::array::ArrayTrait;
use core::serde::Serde;
use core::pedersen::PedersenTrait;
use core::hash::{HashStateTrait, HashStateExTrait};

// Serialization only works for up to 4 elements. Lets hardcode for 5 heehee
impl TupleSize5Serde<
    E0,
    E1,
    E2,
    E3,
    E4,
    +Serde<E0>,
    +Drop<E0>,
    +Serde<E1>,
    +Drop<E1>,
    +Serde<E2>,
    +Drop<E2>,
    +Serde<E3>,
    +Drop<E3>,
    +Serde<E4>,
    +Drop<E4>
> of Serde<(E0, E1, E2, E3, E4)> {
    fn serialize(self: @(E0, E1, E2, E3, E4), ref output: Array<felt252>) {
        let (e0, e1, e2, e3, e4) = self;
        e0.serialize(ref output);
        e1.serialize(ref output);
        e2.serialize(ref output);
        e3.serialize(ref output);
        e4.serialize(ref output)
    }
    fn deserialize(ref serialized: Span<felt252>) -> Option<(E0, E1, E2, E3, E4)> {
        Option::Some(
            (
                Serde::deserialize(ref serialized)?,
                Serde::deserialize(ref serialized)?,
                Serde::deserialize(ref serialized)?,
                Serde::deserialize(ref serialized)?,
                Serde::deserialize(ref serialized)?
            )
        )
    }
}

#[derive(Serde, Drop, Clone, Debug)]
struct Account {
    name: ByteArray,
    amount: u64,
}

#[derive(Serde, Drop, Clone, Debug)]
struct Event {
    from: ByteArray,
    to: ByteArray,
    amount: u64,
}

fn get_account(balances: @Array<Account>, account_name: @ByteArray) -> Option<@Account> {
    let nb_of_accounts: usize = balances.len();
    let mut n = 0;

    let account = loop {
        if n >= nb_of_accounts {
            break Option::None;
        }
        let a: @Account = balances.at(n);
        if (a.name == account_name) {
            break Option::Some(a);
        }
        n += 1;
    };
    account
}

fn update_account(balances: Array<Account>, new_account: Account) -> Array<Account> {
    let nb_of_accounts: usize = balances.len();
    let mut n = 0;
    let mut new_balances: Array<Account> = array![];

    while n < nb_of_accounts {
        let a: @Account = balances.at(n);
        if (a.name == @new_account.name) {
            new_balances.append(new_account.clone());
        } else {
            new_balances.append(a.clone());
        }
        n += 1;
    };
    new_balances
}

fn main(input: Array<felt252>) -> Array<felt252> {
    let mut input = input.span();

    let (mut balances, payload): (Array<Account>, Array<felt252>) = Serde::deserialize(ref input)
        .unwrap();

    /////// APPLICATION PART ///////
    let mut payload_span = payload.span();
    let event: Event = Serde::deserialize(ref payload_span).unwrap();
    // Initial state compute
    let initial_state = compute_state_pedersen_hash(@balances);

    // Get olds balances
    let from_balance = match get_account(@balances, @event.from) {
        Option::Some(x) => x.amount,
        Option::None => panic!("Unable to find the sender")
    };

    let to_balance = match get_account(@balances, @event.to) {
        Option::Some(x) => x.amount,
        Option::None => {
            let new_account = Account { name: event.to.clone(), amount: 0_u64 };
            balances.append(new_account);
            @0_u64
        }
    };

    // Change balances
    assert!(*from_balance >= event.amount, "Does not have enough funds"); // Potential overflow

    let balances1 = update_account(
        balances, Account { name: event.from.clone(), amount: *from_balance - event.amount }
    );
    let balances2 = update_account(
        balances1, Account { name: event.to.clone(), amount: *to_balance + event.amount }
    );

    // Next state compute
    let next_state = compute_state_pedersen_hash(@balances2);

    processHyleOutput(
        1, initial_state, next_state, event.to.clone(), 0, payload.clone(), payload.clone()
    )
}

//////////////// SDK PART ////////////////

#[derive(Serde, Drop, Clone, Debug)]
struct HyleOutput {
    version: u32,
    initial_state: felt252,
    next_state: felt252,
    identity: ByteArray,
    tx_hash: felt252,
    payload_hash: felt252,
    program_outputs: Array<felt252>
}

fn compute_state_pedersen_hash<T, +Serde<T>>(state: @T) -> felt252 {
    let mut serialiazed_state: Array<felt252> = ArrayTrait::new();
    state.serialize(ref serialiazed_state);

    compute_hash_on_elements(serialiazed_state.span())
}

/// Creates a Pedersen hash chain with the elements of `data` and returns the finalized hash.
fn compute_hash_on_elements(mut data: Span<felt252>) -> felt252 {
    let data_len = data.len();
    let mut state = PedersenTrait::new(0);
    let mut hash = 0;
    loop {
        match data.pop_front() {
            Option::Some(elem) => { state = state.update_with(*elem); },
            Option::None => {
                hash = state.update_with(data_len).finalize();
                break;
            },
        };
    };
    hash
}

fn processHyleOutput(
    version: u32,
    initial_state: felt252,
    next_state: felt252,
    identity: ByteArray,
    tx_hash: felt252,
    payload: Array<felt252>,
    program_output: Array<felt252>
) -> Array<felt252> {
    // Hashing payload
    let payload_span = payload.span();
    let payload_hash = compute_hash_on_elements(payload_span);

    // HyleOutput
    let hyle_output = HyleOutput {
        version: version,
        initial_state: initial_state,
        next_state: next_state,
        identity: identity,
        tx_hash: tx_hash,
        payload_hash: payload_hash,
        program_outputs: program_output,
    };

    let mut output: Array<felt252> = ArrayTrait::new();
    hyle_output.serialize(ref output);
    output
}
//////////////////////////////////////////

#[cfg(test)]
mod tests {
    #[test]
    #[should_panic(expected: ("Unable to find the sender",))]
    fn test_main_bad() {
        let input = array![
            2, // balances
            0,
            1634493816,
            4,
            1,
            0,
            422827352430,
            5,
            2,
            7, // payload
            0, // from
            1667657574,
            4,
            0, // to
            1684104562,
            4,
            3, // amount
        ];
        super::main(input);
    }

    #[test]
    fn test_main_good() {
        let input = array![
            2, // balances
            0,
            112568767309172,
            6,
            999999,
            0,
            143880692283855892562876867187038471707818953437745,
            21,
            1,
            7, // payload
            0, // from
            112568767309172,
            6,
            0, // to
            155498244330488045306850287589664177200672003224113,
            21,
            1000, // amount
        ];
        let output = super::main(input);
        assert!(
            output == array![
                1, // version
                3473681837566688972058347073117754751862038027859869083458119877450837776554, // initial_state
                1755898861841461655890616297800169053967980642885812740526786888495552261454, // next_state
                0, // identity
                155498244330488045306850287589664177200672003224113,
                21,
                0, // tx_hash
                3548605693767248747217834656266941711631630347258916905240365336130726092944, // payload_hash
                7, // program_output
                0,
                112568767309172,
                6,
                0,
                155498244330488045306850287589664177200672003224113,
                21,
                1000
            ],
            "Output mismatch"
        );
    }
}
