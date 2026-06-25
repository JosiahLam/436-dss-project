"""Central configuration for Perch.

Everything tunable about the DSS lives here: the ETF universe, the label
definition, feature windows, screening rules, risk-bucket thresholds, and the
optimizer's constraints. Keeping these in one place makes the model's
assumptions auditable -- which matters for a decision-support system that a
human is meant to understand and trust.
"""
from __future__ import annotations

from pathlib import Path

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #
BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
DATA_DIR = BASE_DIR / "perch_data"
PRICES_DIR = DATA_DIR / "prices"
DIVS_DIR = DATA_DIR / "dividends"
DB_PATH = DATA_DIR / "perch.db"

for _d in (DATA_DIR, PRICES_DIR, DIVS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# --------------------------------------------------------------------------- #
# ETF universe (Canadian-listed, income-paying). Curated shortlist standing in
# for the proposal's "find ETFs via TMX Money" step. Categories match the
# proposal: covered_call / equity_income / bond / reit.
# --------------------------------------------------------------------------- #
CATEGORY_LABELS = {
    "covered_call": "Covered call",
    "equity_income": "Equity income",
    "bond": "Bond",
    "reit": "REIT",
}

UNIVERSE: list[dict] = [
    # Covered call
    {"ticker": "ZWB.TO",  "name": "BMO Covered Call Canadian Banks",             "category": "covered_call",  "provider": "BMO"},
    {"ticker": "ZWC.TO",  "name": "BMO CA High Dividend Covered Call",           "category": "covered_call",  "provider": "BMO"},
    {"ticker": "ZWU.TO",  "name": "BMO Covered Call Utilities",                  "category": "covered_call",  "provider": "BMO"},
    {"ticker": "ZWH.TO",  "name": "BMO US High Dividend Covered Call",           "category": "covered_call",  "provider": "BMO"},
    {"ticker": "ZWK.TO",  "name": "BMO Covered Call US Banks",                   "category": "covered_call",  "provider": "BMO"},
    {"ticker": "ZWE.TO",  "name": "BMO Europe High Dividend Covered Call",       "category": "covered_call",  "provider": "BMO"},
    {"ticker": "HMAX.TO", "name": "Hamilton Canadian Financials Yield Maximizer","category": "covered_call",  "provider": "Hamilton"},
    {"ticker": "UMAX.TO", "name": "Hamilton Utilities Yield Maximizer",          "category": "covered_call",  "provider": "Hamilton"},
    {"ticker": "HDIV.TO", "name": "Hamilton Enhanced Multi-Sector Covered Call", "category": "covered_call",  "provider": "Hamilton"},
    # Equity income
    {"ticker": "XEI.TO",  "name": "iShares S&P/TSX Composite High Dividend",     "category": "equity_income", "provider": "iShares"},
    {"ticker": "VDY.TO",  "name": "Vanguard FTSE Canadian High Dividend Yield",  "category": "equity_income", "provider": "Vanguard"},
    {"ticker": "ZDV.TO",  "name": "BMO Canadian Dividend",                       "category": "equity_income", "provider": "BMO"},
    {"ticker": "CDZ.TO",  "name": "iShares S&P/TSX Canadian Dividend Aristocrats","category": "equity_income","provider": "iShares"},
    {"ticker": "XDV.TO",  "name": "iShares Canadian Select Dividend",            "category": "equity_income", "provider": "iShares"},
    {"ticker": "PDC.TO",  "name": "Invesco Canadian Dividend",                   "category": "equity_income", "provider": "Invesco"},
    {"ticker": "ZDI.TO",  "name": "BMO International Dividend",                   "category": "equity_income", "provider": "BMO"},
    {"ticker": "DGRC.TO", "name": "CI WisdomTree Canada Quality Dividend Growth","category": "equity_income", "provider": "CI"},
    {"ticker": "VGG.TO",  "name": "Vanguard US Dividend Appreciation",           "category": "equity_income", "provider": "Vanguard"},
    # REIT
    {"ticker": "ZRE.TO",  "name": "BMO Equal Weight REITs",                      "category": "reit",          "provider": "BMO"},
    {"ticker": "XRE.TO",  "name": "iShares S&P/TSX Capped REIT",                 "category": "reit",          "provider": "iShares"},
    {"ticker": "VRE.TO",  "name": "Vanguard FTSE Canadian Capped REIT",          "category": "reit",          "provider": "Vanguard"},
    {"ticker": "RIT.TO",  "name": "CI Canadian REIT ETF",                        "category": "reit",          "provider": "CI"},
    # Bond / fixed income
    {"ticker": "ZAG.TO",  "name": "BMO Aggregate Bond",                          "category": "bond",          "provider": "BMO"},
    {"ticker": "XBB.TO",  "name": "iShares Core Canadian Universe Bond",         "category": "bond",          "provider": "iShares"},
    {"ticker": "VAB.TO",  "name": "Vanguard Canadian Aggregate Bond",            "category": "bond",          "provider": "Vanguard"},
    {"ticker": "ZCM.TO",  "name": "BMO Mid Corporate Bond",                      "category": "bond",          "provider": "BMO"},
    {"ticker": "XCB.TO",  "name": "iShares Canadian Corporate Bond",             "category": "bond",          "provider": "iShares"},
    {"ticker": "VSB.TO",  "name": "Vanguard Canadian Short-Term Bond",           "category": "bond",          "provider": "Vanguard"},
    {"ticker": "ZFL.TO",  "name": "BMO Long Federal Bond",                       "category": "bond",          "provider": "BMO"},
    {"ticker": "XHY.TO",  "name": "iShares US High Yield Bond (CAD-Hedged)",     "category": "bond",          "provider": "iShares"},
    {"ticker": "CPD.TO",  "name": "iShares S&P/TSX Canadian Preferred Share",    "category": "bond",          "provider": "iShares"},
    {"ticker": "ZPR.TO",  "name": "BMO Laddered Preferred Share",                "category": "bond",          "provider": "BMO"},
]
TICKERS = [e["ticker"] for e in UNIVERSE]
META = {e["ticker"]: e for e in UNIVERSE}

# --------------------------------------------------------------------------- #
# Label definition: did the *regular* distribution get cut within the next
# FORWARD_MONTHS? We smooth to a run-rate first so a single low month or a
# return-of-capital wobble does not count as a cut.
# --------------------------------------------------------------------------- #
FORWARD_MONTHS = 12        # look-ahead horizon for the label
RUNRATE_WINDOW = 3         # months of trailing smoothing for the distribution run-rate
CUT_THRESHOLD = 0.15       # >15% sustained drop in run-rate counts as a cut

# --------------------------------------------------------------------------- #
# Feature windows
# --------------------------------------------------------------------------- #
PAYOUT_TREND_MONTHS = 24
PRICE_TREND_MONTHS = 18
STABILITY_MONTHS = 18

# --------------------------------------------------------------------------- #
# Screening (Module 1): drop too-new, too-small, or leveraged funds.
# --------------------------------------------------------------------------- #
MIN_AGE_MONTHS = 36
# Enhanced / leveraged funds use borrowing to amplify exposure -> screened out.
LEVERAGED_TICKERS: set[str] = {"HDIV.TO"}

# --------------------------------------------------------------------------- #
# Risk buckets from the cut probability.
# --------------------------------------------------------------------------- #
SAFE_MAX = 0.25            # prob < 0.25  -> Safe
RISKY_MIN = 0.55           # prob >= 0.55 -> Risky ; in between -> Watch

# Time-based validation split (proposal: train 2015-2021, test 2022-2024).
TRAIN_END_YEAR = 2021
TEST_START_YEAR = 2022

# --------------------------------------------------------------------------- #
# Optimizer (Module 3) constraints.
# --------------------------------------------------------------------------- #
WATCH_CAP = 0.15           # max portfolio weight in any single Watch ETF
MAX_WEIGHT_PER_ETF = 0.35  # diversification cap on any single holding
SAFE_INCOME_FLOOR = 0.80   # >=80% of expected income from Safe assets (Safe/Balanced plans)
HIGHRISK_SAFE_FLOOR = 0.50 # relaxed floor for the High-risk plan
N_RISK_LEVELS = 12         # volatility levels swept along the efficient frontier
COV_LOOKBACK_MONTHS = 36   # trailing window for the covariance matrix

RISK_FREE_RATE = 0.0       # income-focused; returns are distribution yields
