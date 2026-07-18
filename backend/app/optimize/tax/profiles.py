"""Per-ticker tax profiles — the single source of truth for the account
(asset-location) feature. Deliberately kept OUT of config.UNIVERSE so the whole
tax feature can be rolled back by deleting this package and flipping
``config.TAX_FEATURES_ENABLED`` off, without touching the ML universe.

Each fund carries:
  income_type  -- the tax character of its distributions, which sets shelter
                  priority: interest > reit > covered_call > dividend.
  foreign_pct  -- fraction of the fund's dividend/equity income that is
                  foreign-sourced (US / international) and therefore faces
                  withholding tax that is UNRECOVERABLE in any Canadian
                  registered account (TFSA/RRSP/FHSA) -- these are all
                  Canadian-listed ETFs, so the US treaty exemption (which only
                  covers US-listed securities in an RRSP) does not apply.
                  Values for mixed funds are from published fund fact sheets.
"""
from __future__ import annotations

# ticker -> (income_type, foreign_pct)
TAX_PROFILES: dict[str, dict] = {}


def _p(income_type: str, foreign_pct: float, *tickers: str) -> None:
    for t in tickers:
        TAX_PROFILES[t] = {"income_type": income_type, "foreign_pct": foreign_pct}


# --- interest (bond interest; fully taxed at marginal rate) ------------------
_p("interest", 0.0, "ZAG.TO", "ZFL.TO", "XBB.TO", "VAB.TO", "ZCM.TO", "XCB.TO",
   "VSB.TO", "CBO.TO", "XHB.TO", "XSB.TO", "XLB.TO")
_p("interest", 1.0, "XHY.TO", "HPYT.TO")   # US high-yield / US Treasury: interest
                                           # withholding is largely treaty-exempt,
                                           # so foreign_pct is informational only.
_p("interest", 0.0, "PYF.TO")              # income is domestic cash-fund interest;
                                           # US exposure is option premium (capital
                                           # gains), not foreign dividends.

# --- reit (other income / return of capital; no dividend tax credit) --------
_p("reit", 0.0, "ZRE.TO", "XRE.TO", "VRE.TO", "RIT.TO", "REIT.TO")
_p("reit", 1.0, "CGR.TO", "HGR.TO")        # global real estate
_p("reit", 0.39, "PHR.TO")                 # ~61% Canada / 39% foreign (fund sheet)

# --- covered_call (option premium = capital gains; moderate burden) ----------
_p("covered_call", 0.0, "ZWB.TO", "ZWC.TO", "HMAX.TO", "HDIV.TO", "RCDC.TO", "BANK.TO")
_p("covered_call", 1.0, "ZWH.TO", "ZWK.TO", "ZWE.TO", "ZWA.TO", "ZWT.TO", "ZWG.TO",
   "ZWS.TO", "HYLD.TO", "FHI.TO")
_p("covered_call", 0.45, "ZWU.TO", "UMAX.TO")   # North-American utilities (~45% US)
_p("covered_call", 0.55, "FLI.TO")              # US & Canada lifecos (~55% US)

# --- dividend (equity dividends; Canadian eligible get the div tax credit) ---
_p("dividend", 0.0, "XEI.TO", "VDY.TO", "ZDV.TO", "CDZ.TO", "XDV.TO", "PDC.TO",
   "DGRC.TO", "XDIV.TO",
   "CPD.TO", "ZPR.TO", "DXP.TO",   # Canadian preferred shares = eligible dividends
   "XTR.TO", "ZMI.TO")             # diversified Canadian monthly-income FoFs (mixed)
_p("dividend", 1.0, "ZDI.TO", "VGG.TO", "XHD.TO", "HTA.TO", "HHL.TO", "HUTL.TO")
_p("dividend", 0.50, "XPF.TO")     # North-American preferred (~50% US)

# Fallback for any ticker without an explicit profile.
_CATEGORY_FALLBACK = {
    "bond": "interest",
    "reit": "reit",
    "covered_call": "covered_call",
    "equity_income": "dividend",
}


def profile_for(ticker: str, category: str | None) -> dict:
    """income_type + foreign_pct for a ticker, falling back to the ML category."""
    if ticker in TAX_PROFILES:
        return TAX_PROFILES[ticker]
    return {"income_type": _CATEGORY_FALLBACK.get(category or "", "dividend"),
            "foreign_pct": 0.0}
