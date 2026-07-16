"""Canadian tax-advantaged account allocation (asset location) — redesigned.

Greedy fill: sort a plan's holdings most tax-inefficient first, pour each into
the user's registered accounts (respecting dollar room), overflow the rest to a
taxable account. Splitting a fund across accounts is allowed.

Tax model (see profiles.py for the per-ticker data that drives it):
  shelter priority = how much tax you SAVE by moving $1 of this income from a
  taxable account into registered space.
      interest 5  >  reit 4  >  covered_call 2  >  dividend (1 + 2*foreign_pct)
  Canadian eligible dividends (foreign_pct 0) sit lowest -- the dividend tax
  credit already makes them efficient in a taxable account. Fully-foreign
  dividends (foreign_pct 1) rise to 3: no credit, and withholding they cannot
  reclaim in any registered account (these are Canadian-listed ETFs, so the US
  treaty exemption does not apply) -- but the larger income tax saved still
  makes sheltering worthwhile, just below bonds/REITs.

Registered accounts are filled TFSA -> FHSA -> RRSP for every holding; there is
no foreign-specific RRSP preference (that rule only holds for US-LISTED
securities, which this universe has none of).
"""
from __future__ import annotations

from .profiles import profile_for

_ACCOUNT_LABELS = {
    "tfsa": "TFSA", "rrsp": "RRSP", "fhsa": "FHSA", "non_registered": "Non-registered",
}
_SHELTERED = ("tfsa", "rrsp", "fhsa")
_FILL_ORDER = ("tfsa", "fhsa", "rrsp")

_FIXED_PRIORITY = {"interest": 5.0, "reit": 4.0, "covered_call": 2.0}


def shelter_priority(income_type: str, foreign_pct: float) -> float:
    if income_type == "dividend":
        return 1.0 + 2.0 * foreign_pct     # 1.0 (Canadian eligible) .. 3.0 (all foreign)
    return _FIXED_PRIORITY.get(income_type, 1.0)


# Representative combined (federal + provincial) marginal rate for the savings
# estimate. Deliberately a single round assumption -- this is a rough guide, and
# the real number depends on the user's bracket and province.
MARGINAL_RATE = 0.40


def saved_rate(income_type: str, foreign_pct: float) -> float:
    """Approx income tax avoided per $1 of annual income by sheltering it,
    vs. holding it in a taxable account, at MARGINAL_RATE."""
    m = MARGINAL_RATE
    if income_type == "interest":
        return m                        # fully taxed as ordinary income
    if income_type == "reit":
        return 0.9 * m                  # mostly ordinary income; some ROC defers
    if income_type == "covered_call":
        return 0.5 * m                  # capital-gains character (50% inclusion)
    # dividend: Canadian eligible dividends already get the dividend tax credit
    # (~0.6*m effective); foreign dividends are taxed at the full rate but keep
    # paying ~15% withholding even inside a registered account, so sheltering
    # only avoids the rest.
    cdn = 0.6 * m
    foreign = max(m - 0.15, 0.0)
    return (1.0 - foreign_pct) * cdn + foreign_pct * foreign


def _reason(income_type: str, foreign_pct: float, account: str, had_registered: bool) -> str:
    """One short, honest sentence per placement. Detailed tax facts live behind
    the info button on the client, so this stays terse."""
    taxable = account == "non_registered"
    acc = _ACCOUNT_LABELS.get(account, account)
    fp = int(round(foreign_pct * 100))

    if income_type == "interest":
        return ("Interest is taxed as full income; it overflowed here after your registered room filled."
                if taxable else f"Interest is taxed at your full rate — sheltering it in your {acc} saves the most.")
    if income_type == "reit":
        return ("REIT income gets no dividend credit and is taxed as ordinary income (overflow)."
                if taxable else f"REIT income gets no dividend credit — your {acc} shelters that heavy tax.")
    if income_type == "covered_call":
        base = "Covered-call income is largely capital gains — a moderate burden"
        if taxable:
            return base + ", so a taxable account is tolerable (overflow)."
        return base + f" your {acc} still improves on."
    # dividend
    if foreign_pct >= 0.5:
        if taxable:
            return f"~{fp}% is foreign dividends — held taxable you reclaim the withholding via the foreign tax credit."
        return (f"~{fp}% is foreign dividends facing withholding no registered account can reclaim, "
                f"but your {acc} still avoids the larger income tax.")
    if foreign_pct > 0.0:
        if taxable:
            return f"Mostly Canadian dividends (efficient here); ~{fp}% is foreign and reclaims withholding via the tax credit."
        return f"Mixed dividends (~{fp}% foreign) — your {acc} shelters the foreign portion's withholding-exposed income."
    # Canadian eligible dividends
    if taxable:
        return "Canadian dividends get the dividend tax credit — most tax-efficient kept in a taxable account."
    return f"Canadian dividends are already tax-efficient; this used leftover {acc} room."


# Concise facts for the client's info popover (no false RRSP-treaty claim).
ASSUMPTIONS = [
    "Interest and REIT income are taxed as ordinary income, so they gain the most from any registered shelter.",
    "Canadian eligible dividends (including preferred shares) get the dividend tax credit — most efficient kept taxable.",
    "Foreign dividends face withholding that is unrecoverable in a TFSA/RRSP/FHSA for these Canadian-listed ETFs, but reclaimable via the foreign tax credit in a taxable account.",
    "Covered-call premiums are taxed as capital gains — a moderate burden.",
    "Room is treated as available dollars; a fund may be split across accounts.",
    "The tax-saved figure is a rough annual estimate at a ~40% marginal rate; an RRSP defers this tax rather than erasing it, and your actual rate depends on your bracket and province.",
]
DISCLAIMER = ("Educational estimate — not tax advice; contribution room shown is "
              "user-provided, verify with CRA My Account.")


def _room(accounts: dict, key: str) -> float | None:
    v = accounts.get(key)
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if v > 0 else None


def allocate_accounts(plan: dict, accounts: dict | None) -> dict | None:
    """Split ``plan``'s holdings across registered / taxable accounts.

    ``accounts`` = {"tfsa_room": float|None, "rrsp_room": float|None,
                    "fhsa_room": float|None, "has_non_registered": bool}
    Returns None when the user supplied no usable accounts.
    """
    if not accounts:
        return None

    rooms = {a: _room(accounts, f"{a}_room") for a in _SHELTERED}
    present = [a for a in _SHELTERED if rooms[a] is not None]
    had_registered = bool(present)
    has_non_reg = bool(accounts.get("has_non_registered"))
    if not present and not has_non_reg:
        return None

    remaining = {a: rooms[a] for a in present}
    fill_order = [a for a in _FILL_ORDER if a in present]

    # Enrich + sort holdings most tax-inefficient first (tiebreak: bigger $).
    enriched = []
    for h in plan.get("holdings", []):
        prof = profile_for(h.get("ticker"), h.get("category"))
        prio = shelter_priority(prof["income_type"], prof["foreign_pct"])
        enriched.append((prio, h, prof))
    enriched.sort(key=lambda x: (x[0], x[1].get("allocation", 0.0)), reverse=True)

    buckets: dict[str, list[dict]] = {a: [] for a in present}
    buckets["non_registered"] = []
    tax_saved = 0.0        # annual income tax avoided by sheltering (vs. all taxable)

    for _prio, h, prof in enriched:
        left = float(h.get("allocation", 0.0) or 0.0)
        if left <= 0:
            continue
        it, fp = prof["income_type"], prof["foreign_pct"]
        yld = float(h.get("annual_yield", 0.0) or 0.0)
        rate = saved_rate(it, fp)
        for acc in fill_order:
            if left <= 0:
                break
            avail = remaining.get(acc, 0.0)
            if avail <= 0:
                continue
            take = min(left, avail)
            buckets[acc].append({
                "ticker": h.get("ticker"), "name": h.get("name"),
                "amount": round(take, 2),
                "reason": _reason(it, fp, acc, had_registered),
            })
            tax_saved += take * yld * rate
            remaining[acc] -= take
            left -= take
        if left > 0.01:
            buckets["non_registered"].append({
                "ticker": h.get("ticker"), "name": h.get("name"),
                "amount": round(left, 2),
                "reason": _reason(it, fp, "non_registered", had_registered),
            })

    out_accounts = []
    for acc in present:
        items = buckets[acc]
        out_accounts.append({
            "type": acc, "label": _ACCOUNT_LABELS[acc],
            "room": round(float(rooms[acc]), 2),
            "total": round(sum(i["amount"] for i in items), 2),
            "holdings": items,
        })
    non_reg_items = buckets["non_registered"]
    non_reg_total = round(sum(i["amount"] for i in non_reg_items), 2)
    if non_reg_items or has_non_reg:
        out_accounts.append({
            "type": "non_registered", "label": _ACCOUNT_LABELS["non_registered"],
            "room": None,
            # Honest flag: taxable holdings the user hasn't said they own yet.
            "needs_account": bool(non_reg_items and not has_non_reg),
            "total": non_reg_total, "holdings": non_reg_items,
        })

    invested = round(sum(float(h.get("allocation", 0.0) or 0.0)
                         for h in plan.get("holdings", [])), 2)
    sheltered = round(sum(a["total"] for a in out_accounts if a["type"] != "non_registered"), 2)
    pct = round(sheltered / invested, 4) if invested else 0.0

    def _money(x: float) -> str:
        return f"${x:,.0f}"

    tax_saved_annual = round(tax_saved, 2)
    saved_phrase = (f" That shelters roughly {_money(tax_saved_annual)}/yr in tax versus holding "
                    f"the whole plan in a taxable account." if tax_saved_annual >= 1 else "")

    if invested <= 0:
        summary = "This plan holds no funds to place across your accounts."
    elif non_reg_total <= 0.01:
        summary = (f"All {_money(invested)} fits in your registered accounts — the most heavily "
                   f"taxed income (interest and REITs first) is sheltered, leaving nothing taxed."
                   + saved_phrase)
    else:
        tail = ("into a non-registered account" if has_non_reg
                else "and would need a non-registered account")
        summary = (f"Sheltered {_money(sheltered)} of {_money(invested)} ({round(pct*100)}%); "
                   f"the remaining {_money(non_reg_total)} overflowed {tail}. Interest and REIT "
                   f"income were prioritized into registered room." + saved_phrase)

    return {
        "accounts": out_accounts,
        "invested": invested,
        "sheltered_amount": sheltered,
        "sheltered_pct": pct,
        "unsheltered_amount": non_reg_total,
        "tax_saved_annual": tax_saved_annual,
        "summary": summary,
        "assumptions": ASSUMPTIONS,
        "disclaimer": DISCLAIMER,
    }
