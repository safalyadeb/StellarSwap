use soroban_sdk::contracterror;

/// All error codes used across StellarSwap contracts.
/// Each variant maps to a unique u32 for on-chain error identification.
#[contracterror]
#[derive(Clone, Debug, Copy, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum StellarSwapError {
    // ── Factory errors (1xx) ──────────────────────────────────────────────
    /// Attempting to create a pool that already exists.
    PairAlreadyExists = 100,
    /// token_a == token_b: a pool cannot contain the same token twice.
    IdenticalAddresses = 101,
    /// A required address argument is the zero/dead address.
    ZeroAddress = 102,
    /// Pair index out of bounds in all_pairs list.
    PairIndexOutOfBounds = 103,
    /// Factory is already initialized; initialize() called twice.
    AlreadyInitialized = 104,
    /// Caller is not the fee_to_setter (unauthorized).
    Unauthorized = 105,

    // ── Pair / AMM errors (2xx) ───────────────────────────────────────────
    /// Swap input amount is zero or negative.
    InsufficientInputAmount = 200,
    /// Swap output amount fell below user's minimum (slippage exceeded).
    InsufficientOutputAmount = 201,
    /// Pool reserves are too low to service the swap.
    InsufficientLiquidity = 202,
    /// LP tokens minted would be zero (deposit too small).
    InsufficientLiquidityMinted = 203,
    /// LP tokens burned would yield zero tokens (amount too small).
    InsufficientLiquidityBurned = 204,
    /// The `to` address is invalid (e.g., equals token_x or token_y address).
    InvalidTo = 205,
    /// Output amount >= the pool's reserve (would drain the pool).
    InsufficientReserve = 206,
    /// Constant product invariant was violated after swap — critical safety check.
    InvariantViolation = 207,
    /// Attempted to add liquidity below minimum thresholds.
    InsufficientAAmount = 208,
    InsufficientBAmount = 209,

    // ── Router errors (3xx) ──────────────────────────────────────────────
    /// Transaction deadline has passed.
    ExpiredDeadline = 300,
    /// Swap path is invalid: must have ≥ 2 tokens.
    InvalidPath = 301,
    /// Actual input required exceeds user's maximum (for exact-output swaps).
    ExcessiveInputAmount = 302,
    /// Pair does not exist for the given token pair in the path.
    PairNotFound = 303,

    // ── Math errors (4xx) ────────────────────────────────────────────────
    /// Integer overflow detected in a checked arithmetic operation.
    Overflow = 400,
    /// Division by zero attempted.
    DivisionByZero = 401,

    // ── Token errors (5xx) ───────────────────────────────────────────────
    /// Insufficient token balance for the requested operation.
    InsufficientBalance = 500,
    /// Insufficient token allowance for the requested transfer.
    InsufficientAllowance = 501,
    /// Allowance has expired (expiration_ledger < current_ledger).
    AllowanceExpired = 502,
}
