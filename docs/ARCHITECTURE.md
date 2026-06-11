# StellarSwap — System Architecture

**Version:** 1.0.0  
**Date:** 2026-06-02  

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Contract Architecture](#2-contract-architecture)
3. [Data Flow Diagrams](#3-data-flow-diagrams)
4. [Swap Execution Flow](#4-swap-execution-flow)
5. [Liquidity Flow](#5-liquidity-flow)
6. [Routing Flow](#6-routing-flow)
7. [Storage Architecture](#7-storage-architecture)
8. [Event Architecture](#8-event-architecture)
9. [Off-Chain Architecture](#9-off-chain-architecture)
10. [Contract Interaction Map](#10-contract-interaction-map)
11. [Soroban-Specific Patterns](#11-soroban-specific-patterns)
12. [Deployment Architecture](#12-deployment-architecture)

---

## 1. System Overview

StellarSwap is a three-layer system:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER LAYER                                  │
│   Frontend (Next.js)    │    Trading Bots    │    External dApps    │
└──────────────┬──────────┴────────┬───────────┴──────────┬──────────┘
               │                   │                       │
               └───────────────────▼───────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────────┐
│                         SDK LAYER                                   │
│              TypeScript SDK  │  Rust SDK                            │
│         (transaction builders, math utilities, contract clients)    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                     SMART CONTRACT LAYER                            │
│                                                                     │
│  ┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐   │
│  │   FACTORY    │    │  PAIR (0..N)    │    │     ROUTER       │   │
│  │              │    │                 │    │   (stateless)    │   │
│  │ - Registry   │◄───│ - AMM core      │◄───│ - User interface │   │
│  │ - Create     │    │ - LP tokens     │    │ - Multi-hop      │   │
│  │   pools      │    │ - Reserves      │    │ - Quoting        │   │
│  └──────────────┘    └────────┬────────┘    └──────────────────┘   │
│                               │                                     │
│                    ┌──────────▼──────────┐                         │
│                    │  TOKEN CONTRACTS     │                         │
│                    │  (SEP-41 / SAC)      │                         │
│                    └─────────────────────┘                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ events
┌──────────────────────────────▼──────────────────────────────────────┐
│                     OFF-CHAIN LAYER                                 │
│                                                                     │
│   Horizon API  ──►  Indexer Service  ──►  PostgreSQL  ──►  REST API │
│                          │                                          │
│                    Grafana/Metrics                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Contract Architecture

### 2.1 Factory Contract

**Role**: Single-instance registry and deployer for all liquidity pools.

```
┌────────────────────────────────────────────────┐
│                   FACTORY                       │
│                                                │
│  State:                                        │
│    admin: Address                              │
│    fee_to: Option<Address>                     │
│    fee_to_setter: Address                      │
│    pair_count: u32                             │
│    pairs: Map<(Addr,Addr), Addr>  (persistent) │
│    all_pairs: Vec<Addr>           (persistent) │
│                                                │
│  Public Functions:                             │
│    initialize(admin, fee_to_setter)            │
│    create_pair(token_a, token_b) → Addr        │
│    get_pair(token_a, token_b) → Addr           │
│    all_pairs(index) → Addr                     │
│    all_pairs_length() → u32                    │
│    set_fee_to(addr)         [admin only]        │
│    set_fee_to_setter(addr)  [admin only]        │
└────────────────────────────────────────────────┘
```

**Key design**: Factory is the single authority for pair registration. Anyone can call `create_pair` — it's permissionless. Admin functions control only the protocol fee recipient.

### 2.2 Pair Contract

**Role**: Core AMM logic. One instance per token pair. Holds all reserves.

```
┌────────────────────────────────────────────────────────────┐
│                        PAIR                                │
│                                                            │
│  State:                                                    │
│    token_x: Address           (instance)                  │
│    token_y: Address           (instance)                  │
│    reserve_x: i128            (instance)                  │
│    reserve_y: i128            (instance)                  │
│    total_lp_supply: i128      (instance)                  │
│    k_last: i128               (instance)                  │
│    factory: Address           (instance)                  │
│    lp_balances: Map<Addr,i128> (persistent, per user)     │
│    lp_allowances: Map<(Addr,Addr),i128> (persistent)      │
│                                                            │
│  Liquidity Functions:                                      │
│    add_liquidity(caller, dx, dy, dx_min, dy_min, to)      │
│    remove_liquidity(caller, lp, dx_min, dy_min, to)       │
│                                                            │
│  Swap Functions:                                           │
│    swap(caller, amount_x_out, amount_y_out, to)           │
│                                                            │
│  LP Token Functions (SEP-41):                             │
│    lp_transfer(from, to, amount)                          │
│    lp_approve(from, spender, amount, exp_ledger)          │
│    lp_allowance(from, spender) → i128                     │
│    lp_balance(account) → i128                             │
│    lp_total_supply() → i128                               │
│                                                            │
│  Utility:                                                  │
│    sync()                                                  │
│    skim(to)                                                │
│    get_reserves() → (i128, i128)                          │
└────────────────────────────────────────────────────────────┘
```

**Key design**: Pair is the most security-critical contract. It is deployed by Factory and initialized once. After initialization, no administrative functions exist — it is fully immutable and permissionless.

### 2.3 Router Contract

**Role**: Stateless user-facing interface. Computes optimal amounts, handles routing.

```
┌────────────────────────────────────────────────────────────┐
│                        ROUTER                              │
│                                                            │
│  State:                                                    │
│    factory: Address           (instance — set at deploy)  │
│                                                            │
│  Swap Functions:                                           │
│    swap_exact_tokens_for_tokens(                          │
│      caller, amount_in, amount_out_min,                   │
│      path[], to, deadline)                                │
│    swap_tokens_for_exact_tokens(                          │
│      caller, amount_out, amount_in_max,                   │
│      path[], to, deadline)                                │
│                                                            │
│  Liquidity Functions:                                      │
│    add_liquidity(token_a, token_b, da, db, da_min,        │
│                  db_min, to, deadline)                    │
│    remove_liquidity(token_a, token_b, lp,                 │
│                     da_min, db_min, to, deadline)         │
│                                                            │
│  Quote Functions (view, no state change):                 │
│    get_amount_out(amount_in, reserve_in, reserve_out)     │
│    get_amount_in(amount_out, reserve_in, reserve_out)     │
│    get_amounts_out(amount_in, path[]) → i128[]            │
│    get_amounts_in(amount_out, path[]) → i128[]            │
│    quote(amount_a, reserve_a, reserve_b) → i128           │
└────────────────────────────────────────────────────────────┘
```

**Key design**: Router is stateless except for the factory address set at deployment. It can be upgraded or replaced by deploying a new Router pointing to the same Factory. Users should verify the Router address.

### 2.4 Shared Library

```
contracts/shared/
├── errors.rs     ← All error codes for all contracts
├── math.rs       ← get_amount_out, get_amount_in, quote, sqrt
└── types.rs      ← PairInfo, ReserveSnapshot, shared structs
```

---

## 3. Data Flow Diagrams

### 3.1 System Data Flow

```
User Wallet (Freighter)
        │
        │  Signs Transaction
        ▼
Stellar Network (SCP Consensus)
        │
        │  Executes Contract
        ▼
Router Contract
   │           │
   │ lookup    │ call
   ▼           ▼
Factory     Pair Contract(s)
   │              │
   │ reads        │ reads/writes
   ▼              ▼
Registry      Token Contracts
              (transfer tokens)
        │
        │ emits events
        ▼
Horizon API
        │
        │ streams events
        ▼
Indexer Service
        │
        │ persists
        ▼
PostgreSQL DB
        │
        │ serves
        ▼
REST API ──► Frontend Analytics
```

---

## 4. Swap Execution Flow

### 4.1 Simple Swap: Token A → Token B

```
User
 │
 │  1. Approve Router to spend Token A (if needed)
 │     [Token A Contract]: approve(router, amount_in, exp_ledger)
 │
 ▼
Router.swap_exact_tokens_for_tokens(
  caller=User, amount_in=100, amount_out_min=95,
  path=[TOKEN_A, TOKEN_B], to=User, deadline=now+300
)
 │
 │  2. Deadline check: timestamp ≤ deadline ✓
 │
 │  3. Factory.get_pair(TOKEN_A, TOKEN_B) → PAIR_AB
 │
 │  4. PAIR_AB.get_reserves() → (reserve_a, reserve_b)
 │
 │  5. Compute: amount_out = get_amount_out(100, reserve_a, reserve_b)
 │     = (100 * 997 * reserve_b) / (reserve_a * 1000 + 100 * 997)
 │
 │  6. Check: amount_out >= amount_out_min (95) ✓
 │
 │  7. TOKEN_A.transfer(User → PAIR_AB, amount_in=100)
 │
 │  8. PAIR_AB.swap(
 │       amount_x_out=0, amount_y_out=amount_out, to=User
 │     )
 │      │
 │      │  a. Read new balances from token contracts
 │      │  b. Calculate amount_x_in from balance delta
 │      │  c. Verify invariant:
 │      │     (bal_x - 0*3/1000) * (bal_y - amount_out*3/1000)
 │      │       >= reserve_x * reserve_y ✓
 │      │  d. TOKEN_B.transfer(PAIR_AB → User, amount_out)
 │      │  e. Update reserves
 │      │  f. Emit swap event
 │
 │  9. Return [amount_in, amount_out]
 ▼
User receives Token B
```

### 4.2 Swap State Transition

```
Before Swap:
  Pool State: reserve_x=1000, reserve_y=1000, k=1,000,000
  User: 100 TOKEN_A, 0 TOKEN_B

  ────────────────────
  │  PAIR_AB         │
  │  reserve_x: 1000 │
  │  reserve_y: 1000 │
  ────────────────────

Swap: User sells 100 TOKEN_A
  amount_in_eff = 100 * 997 / 1000 = 99.7 (integer: 997)
  amount_out = (997 * 1000) / (1000 * 1000 + 997) = 997000/1000997 ≈ 90.6

After Swap:
  Pool State: reserve_x=1100, reserve_y≈909.4, k≈1,000,340 (increased due to fee!)
  User: 0 TOKEN_A, ~90.6 TOKEN_B

  ────────────────────────
  │  PAIR_AB             │
  │  reserve_x: 1100     │   ← +100 (user sold)
  │  reserve_y: ~909.4   │   ← -90.6 (user received)
  │  k: ~1,000,340       │   ← k grew by ~0.034% (fee)
  ────────────────────────
```

---

## 5. Liquidity Flow

### 5.1 Add Liquidity Flow

```
LP Provider (Alice)
 │
 │  Router.add_liquidity(
 │    token_a=TOKEN_A, token_b=TOKEN_B,
 │    amount_a_desired=1000, amount_b_desired=1000,
 │    amount_a_min=990, amount_b_min=990,
 │    to=Alice, deadline=now+300
 │  )
 │
 │  1. Deadline check ✓
 │
 │  2. Factory.get_pair(TOKEN_A, TOKEN_B) → PAIR_AB
 │     (or create_pair if it doesn't exist)
 │
 │  3. PAIR_AB.get_reserves() → (reserve_a, reserve_b)
 │
 │  If reserves are (0, 0) — first deposit:
 │    amount_a = amount_a_desired = 1000
 │    amount_b = amount_b_desired = 1000
 │
 │  If reserves are non-zero:
 │    amount_b_optimal = quote(1000, reserve_a, reserve_b)
 │    If amount_b_optimal <= amount_b_desired:
 │      use (1000, amount_b_optimal)
 │    Else:
 │      amount_a_optimal = quote(1000, reserve_b, reserve_a)
 │      use (amount_a_optimal, 1000)
 │
 │  4. Check: amounts >= minimums ✓
 │
 │  5. TOKEN_A.transfer(Alice → PAIR_AB, amount_a)
 │  6. TOKEN_B.transfer(Alice → PAIR_AB, amount_b)
 │
 │  7. PAIR_AB.add_liquidity(...)
 │      │
 │      │  If total_supply == 0 (first deposit):
 │      │    lp = sqrt(amount_a * amount_b) - MINIMUM_LIQUIDITY
 │      │    Mint MINIMUM_LIQUIDITY to dead address
 │      │  Else:
 │      │    lp = min(
 │      │      amount_a * total_supply / reserve_a,
 │      │      amount_b * total_supply / reserve_b
 │      │    )
 │      │  Mint lp tokens to Alice
 │      │  Update reserves
 │      │  Emit liquidity_added event
 │
 │  8. Return (amount_a, amount_b, lp_minted)
 ▼
Alice receives LP tokens
```

### 5.2 Remove Liquidity Flow

```
LP Provider (Alice)
 │
 │  1. PAIR_AB.lp_approve(Alice → Router, lp_amount)
 │
 │  Router.remove_liquidity(
 │    token_a, token_b, liquidity=lp_amount,
 │    amount_a_min, amount_b_min, to=Alice, deadline
 │  )
 │
 │  2. Deadline check ✓
 │
 │  3. PAIR_AB.lp_transfer(Alice → PAIR_AB, lp_amount)
 │     (Router transfers LP tokens to pair to burn)
 │
 │  4. PAIR_AB.remove_liquidity(lp_amount, a_min, b_min, Alice)
 │      │
 │      │  amount_a = lp_amount * reserve_a / total_supply
 │      │  amount_b = lp_amount * reserve_b / total_supply
 │      │  Check: amount_a >= amount_a_min ✓
 │      │  Check: amount_b >= amount_b_min ✓
 │      │  Burn lp_amount from PAIR_AB's own balance
 │      │  TOKEN_A.transfer(PAIR_AB → Alice, amount_a)
 │      │  TOKEN_B.transfer(PAIR_AB → Alice, amount_b)
 │      │  Update reserves
 │      │  Emit liquidity_removed event
 │
 ▼
Alice receives Token A + Token B
(more than deposited if fees were earned)
```

---

## 6. Routing Flow

### 6.1 Multi-Hop Swap: A → B → C

```
User wants: TOKEN_A → TOKEN_C
No direct A/C pool exists.
Path: [TOKEN_A, TOKEN_B, TOKEN_C]

Router.swap_exact_tokens_for_tokens(
  amount_in=1000,
  amount_out_min=850,
  path=[TOKEN_A, TOKEN_B, TOKEN_C],
  to=User,
  deadline=now+300
)

Step 1: Compute amounts
  reserves_AB = PAIR_AB.get_reserves()
  amount_b_out = get_amount_out(1000, reserve_a, reserve_b)
                = let's say 950

  reserves_BC = PAIR_BC.get_reserves()
  amount_c_out = get_amount_out(950, reserve_b, reserve_c)
                = let's say 920

Step 2: Validate
  amount_c_out (920) >= amount_out_min (850) ✓

Step 3: Execute hops

  TOKEN_A.transfer(User → PAIR_AB, 1000)
       │
       ▼
  PAIR_AB.swap(amount_x_out=0, amount_y_out=950, to=PAIR_BC)
       │
       │  TOKEN_B flows directly PAIR_AB → PAIR_BC
       ▼
  PAIR_BC.swap(amount_x_out=0, amount_y_out=920, to=User)
       │
       │  TOKEN_C flows directly PAIR_BC → User
       ▼
  User receives 920 TOKEN_C

Key insight: Tokens never pass through Router.
Pair-to-pair direct transfers minimize calls and eliminate custody risk.

┌──────────┐  TOKEN_A   ┌──────────┐  TOKEN_B   ┌──────────┐  TOKEN_C
│   User   │ ─────────► │ PAIR_AB  │ ─────────► │ PAIR_BC  │ ───────► User
└──────────┘   1000      └──────────┘    950      └──────────┘   920
```

### 6.2 Routing Decision Tree

```
User Input: swap TOKEN_A for TOKEN_C

Does PAIR_AC exist?
├─ YES → Single hop: A → C
└─ NO  → Find intermediate token B
          Does PAIR_AB exist AND PAIR_BC exist?
          ├─ YES → Two hop: A → B → C
          └─ NO  → Find longer path or revert "No route found"

(MVP: path is provided by user/frontend, Router does not auto-discover paths)
(Future: off-chain path finding via indexer API)
```

---

## 7. Storage Architecture

### 7.1 Soroban Storage Types

```
Soroban Storage Types:
┌─────────────────────────────────────────────────────────┐
│ INSTANCE STORAGE                                        │
│ • Tied to contract instance lifetime                    │
│ • TTL extended by contract bump calls                   │
│ • Best for: core config, frequently accessed state      │
│ • Cost: 1 read = cheap (cached per transaction)         │
├─────────────────────────────────────────────────────────┤
│ PERSISTENT STORAGE                                      │
│ • Independent TTL per entry                             │
│ • Survives if TTL maintained; archived if TTL expires   │
│ • Best for: LP balances (per-user, infrequent access)   │
│ • Cost: per-entry TTL extension required                │
├─────────────────────────────────────────────────────────┤
│ TEMPORARY STORAGE                                       │
│ • Expires at end of ledger                              │
│ • Best for: within-transaction intermediate state       │
│ • Not used in StellarSwap (all state is persistent)     │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Factory Storage Schema

```
Instance Storage:
  Key::Admin              → Address
  Key::FeeTo              → Option<Address>
  Key::FeeToSetter        → Address
  Key::PairCount          → u32

Persistent Storage:
  Key::Pair(token_x, token_y)  → Address      (canonical order)
  Key::AllPairs(index: u32)    → Address      (indexed list)
```

### 7.3 Pair Storage Schema

```
Instance Storage:
  Key::TokenX      → Address
  Key::TokenY      → Address
  Key::ReserveX    → i128
  Key::ReserveY    → i128
  Key::TotalSupply → i128
  Key::KLast       → i128
  Key::Factory     → Address
  Key::Initialized → bool

Persistent Storage (per user — extended when accessed):
  Key::LpBalance(address)              → i128
  Key::LpAllowance(owner, spender)     → (i128, exp_ledger)
```

### 7.4 TTL Extension Strategy

```rust
const LEDGER_BUMP_AMOUNT: u32 = 535_000;  // ~90 days at 5s/ledger
const LEDGER_THRESHOLD: u32 = 535_000 / 2; // Bump if below halfway

// Called at start of every contract invocation:
fn extend_instance_ttl(env: &Env) {
    env.storage().instance().extend_ttl(
        LEDGER_THRESHOLD,
        LEDGER_BUMP_AMOUNT,
    );
}

// Called when accessing per-user state:
fn extend_persistent_ttl(env: &Env, key: &DataKey) {
    env.storage().persistent().extend_ttl(
        key,
        LEDGER_THRESHOLD,
        LEDGER_BUMP_AMOUNT,
    );
}
```

---

## 8. Event Architecture

### 8.1 Event Schema

All events use Soroban's native event system, indexed by Horizon.

```
Event: swap
  Topics: [Symbol("swap"), pair_address: Address]
  Data:   {
    from:       Address,   // caller
    amount_in:  i128,
    amount_out: i128,
    token_in:   Address,
    token_out:  Address,
  }

Event: liquidity_added
  Topics: [Symbol("liquidity_added"), pair_address: Address]
  Data:   {
    provider:   Address,
    amount_x:   i128,
    amount_y:   i128,
    lp_minted:  i128,
  }

Event: liquidity_removed
  Topics: [Symbol("liquidity_removed"), pair_address: Address]
  Data:   {
    provider:   Address,
    amount_x:   i128,
    amount_y:   i128,
    lp_burned:  i128,
  }

Event: pair_created
  Topics: [Symbol("pair_created"), factory_address: Address]
  Data:   {
    token_x:    Address,
    token_y:    Address,
    pair:       Address,
    pair_index: u32,
  }

Event: sync
  Topics: [Symbol("sync"), pair_address: Address]
  Data:   {
    reserve_x: i128,
    reserve_y: i128,
  }
```

### 8.2 Event Indexing Pipeline

```
Stellar Network
     │
     │  Soroban Events (per ledger)
     ▼
Horizon API (soroban_events endpoint)
     │
     │  SSE stream (Server-Sent Events)
     ▼
Indexer Service (Node.js)
     │
     ├─► Event Parser
     │     - Deserialize XDR event topics/data
     │     - Route to appropriate processor
     │
     ├─► Swap Processor
     │     - Store in swaps table
     │     - Update 24h volume cache
     │
     ├─► Liquidity Processor
     │     - Store in liquidity_events table
     │     - Update TVL cache
     │
     └─► Pair Processor
           - Register new pairs
           - Update pair snapshots
     │
     ▼
PostgreSQL Database
     │
     ▼
REST API
```

---

## 9. Off-Chain Architecture

### 9.1 Frontend Architecture

```
Next.js App (frontend/)
├── App Router (src/app/)
│   ├── /              ← Swap page
│   ├── /liquidity     ← Add/Remove liquidity
│   └── /pools         ← Pool explorer
│
├── Components (src/components/)
│   ├── swap/          ← Swap form, token selector, slippage
│   ├── liquidity/     ← Add/remove forms
│   ├── pools/         ← Pool table, stats
│   └── shared/        ← Wallet, modal, icons
│
├── Hooks (src/hooks/)
│   ├── useWallet      ← Freighter integration
│   ├── useSwap        ← Swap state + execution
│   └── useLiquidity   ← Liquidity state + execution
│
└── Lib (src/lib/)
    ├── sdk.ts         ← Initialized SDK clients
    └── constants.ts   ← Contract addresses, network config
```

### 9.2 Indexer Architecture

```
indexer/
├── horizon.ts         ← Horizon SSE client, event subscription
├── processors/
│   ├── swap.ts        ← Swap event handler
│   ├── liquidity.ts   ← Liquidity event handler
│   └── pair.ts        ← Pair creation handler
├── db/
│   ├── schema.ts      ← TypeORM/Drizzle schema
│   └── queries.ts     ← Typed query helpers
└── api/
    ├── server.ts      ← Express/Fastify server
    └── routes/
        ├── pairs.ts
        ├── swaps.ts
        └── analytics.ts
```

### 9.3 Local Development Stack (Docker Compose)

```yaml
services:
  stellar-node:
    image: stellar/quickstart:latest
    ports: [8000:8000]      # Horizon API
    
  postgres:
    image: postgres:15
    ports: [5432:5432]
    
  indexer:
    build: ./indexer
    depends_on: [stellar-node, postgres]
    
  frontend:
    build: ./frontend
    ports: [3000:3000]
    depends_on: [indexer]
```

---

## 10. Contract Interaction Map

```
                    ┌──────────────────────────────────────┐
                    │             FACTORY                   │
                    │                                      │
                    │  create_pair(token_a, token_b)       │
                    │    └──► deploys new PAIR contract    │
                    │         and initializes it           │
                    └──────────────────┬───────────────────┘
                                       │
                           registers pair address
                                       │
                    ┌──────────────────▼───────────────────┐
                    │        PAIR [TOKEN_A / TOKEN_B]       │
                    │                                      │
                    │  Implements:                         │
                    │    ├─ add_liquidity()                │
                    │    ├─ remove_liquidity()             │
                    │    ├─ swap()                         │
                    │    ├─ sync() / skim()                │
                    │    └─ SEP-41 LP token functions      │
                    │                                      │
                    │  Calls:                              │
                    │    ├─► TOKEN_A.transfer()            │
                    │    └─► TOKEN_B.transfer()            │
                    └──────────────────────────────────────┘
                                       ▲
                                       │ calls swap/liquidity
                    ┌──────────────────┴───────────────────┐
                    │              ROUTER                   │
                    │                                      │
                    │  User-facing functions:              │
                    │    ├─ swap_exact_tokens_for_tokens() │
                    │    ├─ swap_tokens_for_exact_tokens() │
                    │    ├─ add_liquidity()                │
                    │    ├─ remove_liquidity()             │
                    │    └─ get_amount_out/in/quote()      │
                    │                                      │
                    │  Calls:                              │
                    │    ├─► FACTORY.get_pair()            │
                    │    └─► PAIR.swap() / add/remove()    │
                    └──────────────────────────────────────┘
                                       ▲
                                       │ sends transactions
                    ┌──────────────────┴───────────────────┐
                    │           USER / SDK                  │
                    └──────────────────────────────────────┘
```

---

## 11. Soroban-Specific Patterns

### 11.1 Authorization Pattern

Unlike Ethereum's `msg.sender`, Soroban uses explicit authorization:

```rust
// Caller must authorize this call
caller.require_auth();

// For sub-auth (e.g., Router calling Pair on behalf of user)
// The user signs an authorization for the Router to call on their behalf
// using Soroban's native auth framework
```

### 11.2 Cross-Contract Call Pattern

```rust
// Calling a token contract
let token_client = token::Client::new(&env, &token_address);
token_client.transfer(&from, &to, &amount);

// Calling Factory from Router
let factory_client = factory::Client::new(&env, &self.factory);
let pair_address = factory_client.get_pair(&token_a, &token_b);
```

### 11.3 Deterministic Contract Deployment

```rust
// In Factory — deploying a new Pair contract
let salt = (token_x.clone(), token_y.clone());
let salt_bytes = salt.to_xdr(&env); // deterministic bytes

let pair_address = env
    .deployer()
    .with_address(env.current_contract_address(), Bytes::from_slice(&env, &salt_hash))
    .deploy_v2(pair_wasm_hash, ());
```

This allows off-chain computation of pair addresses before they're created.

### 11.4 Contract Upgrade Pattern

```rust
// In Router (upgradeable)
fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
    admin.require_auth();
    env.deployer().update_current_contract_wasm(new_wasm_hash);
}
// Pair contracts are NOT upgradeable (no upgrade function)
```

### 11.5 Error Handling Pattern

```rust
// Using panic_with_error! for contract errors
use soroban_sdk::panic_with_error;

if amount_in <= 0 {
    panic_with_error!(&env, StellarSwapError::InsufficientInputAmount);
}
```

---

## 12. Deployment Architecture

### 12.1 Contract Deployment Sequence

```
Step 1: Deploy shared WASM (contracts/shared → wasm artifact)
Step 2: Deploy token WASM (for test tokens only)
Step 3: Deploy pair WASM (upload, get wasm_hash)
Step 4: Deploy factory (initialize with admin + pair_wasm_hash)
Step 5: Deploy router (initialize with factory_address)

Post-Deploy:
Step 6: Create test token contracts (TOKEN_A, TOKEN_B, TOKEN_C)
Step 7: Create pools via factory: (A/B), (B/C)
Step 8: Seed initial liquidity via router
Step 9: Write all addresses to config/testnet.json
```

### 12.2 Network Configuration

```json
{
  "testnet": {
    "network": "testnet",
    "rpcUrl": "https://soroban-testnet.stellar.org",
    "networkPassphrase": "Test SDF Network ; September 2015",
    "contracts": {
      "factory": "C...",
      "router": "C...",
      "tokens": {
        "TOKEN_A": "C...",
        "TOKEN_B": "C...",
        "TOKEN_C": "C..."
      },
      "pairs": {
        "TOKEN_A/TOKEN_B": "C...",
        "TOKEN_B/TOKEN_C": "C..."
      }
    }
  }
}
```

### 12.3 Upgrade Strategy

| Contract | Upgradeable? | Strategy |
|----------|-------------|---------|
| Factory | Admin-only | Deploy new Factory, migrate via indexer |
| Pair | No | Immutable — new pairs use new bytecode |
| Router | Admin-only | Deploy new Router, update SDK config |
| Shared | N/A (library) | Update all contracts that import it |

---

*End of ARCHITECTURE — Version 1.0.0*
