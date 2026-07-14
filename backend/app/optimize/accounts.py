"""Canadian tax-advantaged account allocation (asset location).

Given one of the optimizer's plans and the registered accounts a user holds,
this module decides *where* to hold each fund — TFSA / RRSP / FHSA vs. a plain
non-registered (taxable) account — so the most tax-inefficient income sits in
sheltered space. It is a decision-support aid, so every placement carries a
one-sentence, human-readable ``reason``.

The heuristic is grounded in real Canadian tax treatment and keyed off each
holding's ``category`` (covered_call / equity_income / bond / reit) plus a
``foreign`` flag inferred from the fund name (US / Europe / International /
Global ... exposure):

    bond   > reit > covered_call > foreign equity income > Canadian equity income
    (most tax-inefficient, shelter first) ............ (most tax-efficient, keep taxable)

* Bond / fixed income  — interest is taxed as ordinary income at the full
  marginal rate in a taxable account → highest shelter priority.
* REIT                 — distributions are mostly "other income" / return of
  capital with no dividend tax credit → high shelter priority (TFSA especially).
* Covered call         — option-premium income is taxed as capital gains, mixed
  with distributions → medium priority.
* Foreign dividends    — no Canadian dividend tax credit and face (mostly US)
  withholding tax; unrecoverable inside a TFSA/FHSA, exempt in an RRSP for
  US-listed securities, creditable in a taxable account via the foreign tax
  credit → shelter above Canadian equity income, and prefer RRSP over TFSA.
* Canadian equity income — eligible Canadian dividends get the dividend tax
  credit, so they are the most tax-efficient income to keep *non-registered* →
  lowest shelter priority.

Allocation is a simple, honest greedy fill: sort a plan's holdings most
tax-inefficient first, pour each into the user's sheltered accounts (respecting
each account's remaining room in dollars), and overflow the rest to the
non-registered account. A single fund may be split across accounts at the dollar
level when room runs out mid-holding.
"""
from __future__ import annotations

import re

# --------------------------------------------------------------------------- #
# Foreign-exposure inference (auditable: pure keyword match on the fund name).
# --------------------------------------------------------------------------- #
_FOREIGN_RE = re.compile(
    r"\b(US|U\.S\.?|UNITED STATES|AMERICA|AMERICAN|EUROPE|EUROPEAN|"
    r"INTERNATIONAL|GLOBAL|WORLD|EMERGING|EAFE|NASDAQ|DOW JONES|"
    r"S&P 500|NORTH AMERICAN|GIANTS)\b",
    re.I,
)
_CANADA_RE = re.compile(r"\b(CANAD(A|IAN)|TSX)\b", re.I)


def is_foreign(name: str | None, ticker: str | None = None) -> bool:
    """True if the fund is foreign-equity-focused (US/Europe/International/...).

    A domestic marker (Canada / Canadian / TSX) in the name wins ties — e.g.
    "US & Canada Lifeco" is treated as domestic — keeping the flag conservative.
    """
    n = name or ""
    return bool(_FOREIGN_RE.search(n) and not _CANADA_RE.search(n))


# --------------------------------------------------------------------------- #
# Shelter priority. Higher number = more tax-inefficient = fill shelter first.
# --------------------------------------------------------------------------- #
_BASE_PRIORITY = {
    "bond": 5.0,
    "reit": 4.0,
    "covered_call": 3.0,
    "equity_income": 1.0,
}


def shelter_priority(category: str | None, foreign: bool) -> float:
    base = _BASE_PRIORITY.get(category or "", 2.0)
    if foreign and category == "equity_income":
        # Foreign dividends lose the dividend tax credit and face withholding,
        # so they shelter ahead of covered-call income but below REIT/bond.
        base = 2.0
    return base


# --------------------------------------------------------------------------- #
# Account metadata.
# --------------------------------------------------------------------------- #
_ACCOUNT_LABELS = {
    "tfsa": "TFSA",
    "rrsp": "RRSP",
    "fhsa": "FHSA",
    "non_registered": "Non-registered",
}
_SHELTERED = ("tfsa", "rrsp", "fhsa")


def _preferred_order(foreign: bool, present: list[str]) -> list[str]:
    """Order in which to fill the user's *sheltered* accounts for a holding."""
    if foreign:
        # RRSP first: US withholding tax is treaty-exempt for US securities in an
        # RRSP but unrecoverable in a TFSA/FHSA.
        order = ["rrsp", "tfsa", "fhsa"]
    else:
        # TFSA first: tax-free growth with no future tax, ideal for the most
        # heavily taxed domestic income (interest, REIT distributions).
        order = ["tfsa", "fhsa", "rrsp"]
    return [a for a in order if a in present]


def _reason(category: str | None, foreign: bool, account: str, overflow: bool) -> str:
    acc = _ACCOUNT_LABELS.get(account, account)
    if account == "non_registered":
        if category == "equity_income" and not foreign:
            return ("Canadian eligible dividends qualify for the dividend tax credit, "
                    "making them the most tax-efficient income to keep in a non-registered account.")
        if category == "equity_income" and foreign:
            return ("Held non-registered you can still claim the foreign tax credit for "
                    "withholding tax (unlike in a TFSA) — a reasonable overflow spot once registered room is used up.")
        if category == "bond":
            return ("Bond interest is fully taxed at your marginal rate here — it overflowed "
                    "to taxable only because your registered room ran out.")
        if category == "reit":
            return ("REIT distributions are taxed as ordinary/other income here — they landed "
                    "non-registered only after your sheltered room was exhausted.")
        if category == "covered_call":
            return ("Covered-call income is largely capital gains, so a taxable account is "
                    "tolerable — this is the overflow once registered room is used up.")
        return "Overflow into a taxable account once your registered room is used up."

    # Sheltered placements.
    if category == "bond":
        return (f"Bond interest is fully taxed at your marginal rate — sheltering it in your "
                f"{acc} removes that tax and saves the most.")
    if category == "reit":
        if account == "tfsa":
            return ("REIT distributions are mostly other income / return of capital with no "
                    "dividend tax credit — your TFSA shields them completely and is their ideal home.")
        return (f"REIT distributions get no dividend tax credit and are taxed as ordinary income "
                f"— your {acc} shelters that heavy tax.")
    if category == "covered_call":
        return (f"Covered-call funds mix option premiums (taxed as capital gains) with "
                f"distributions — a moderate tax burden your {acc} still improves on.")
    if category == "equity_income" and foreign:
        if account == "rrsp":
            return ("Foreign dividends get no Canadian dividend tax credit and face US "
                    "withholding tax — an RRSP is treaty-exempt from that withholding for US securities, the best shelter for them.")
        return (f"Foreign dividends face withholding tax a {acc} can't reclaim, but sheltering "
                f"them here still gives tax-free growth — an RRSP would additionally avoid the withholding.")
    # Canadian equity income placed in shelter (only after higher-priority holdings).
    return (f"Canadian dividends are already tax-efficient thanks to the dividend tax credit, "
            f"so this used leftover {acc} room after more heavily taxed funds were sheltered.")


_ASSUMPTIONS = [
    "Bond and fixed-income interest is taxed as ordinary income at your full marginal rate, so it benefits most from any registered shelter.",
    "REIT distributions are largely 'other income' / return of capital with no dividend tax credit; a TFSA shelters them best.",
    "Covered-call funds earn option premiums taxed as capital gains plus mixed distributions — a moderate tax burden.",
    "Eligible Canadian dividends receive the dividend tax credit, making them the most tax-efficient income to hold in a non-registered account.",
    "Foreign (especially US) dividends face withholding tax that is unrecoverable inside a TFSA or FHSA, exempt in an RRSP for US-listed securities, and creditable in a taxable account via the foreign tax credit.",
    "Contribution room is treated as available dollars; placement is dollar-level and may split a single fund across accounts when room runs out.",
]

_DISCLAIMER = ("Educational estimate — not tax advice; contribution room shown is "
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
    """Split ``plan``'s holdings across the user's registered / taxable accounts.

    ``accounts`` shape::

        {"tfsa_room": float|None, "rrsp_room": float|None,
         "fhsa_room": float|None, "has_non_registered": bool}

    Returns ``None`` when the user supplied no accounts at all (feature skipped).
    """
    if not accounts:
        return None

    rooms = {a: _room(accounts, f"{a}_room") for a in _SHELTERED}
    present = [a for a in _SHELTERED if rooms[a] is not None]
    has_non_reg = bool(accounts.get("has_non_registered"))
    if not present and not has_non_reg:
        return None  # nothing to allocate into — skip

    remaining = {a: float(rooms[a]) for a in present}

    # Order holdings most tax-inefficient first (tiebreak: bigger dollars first).
    holdings = list(plan.get("holdings", []))
    enriched = []
    for h in holdings:
        foreign = is_foreign(h.get("name"), h.get("ticker"))
        enriched.append((shelter_priority(h.get("category"), foreign), h, foreign))
    enriched.sort(key=lambda x: (x[0], x[1].get("allocation", 0.0)), reverse=True)

    # account key -> list of placements
    buckets: dict[str, list[dict]] = {a: [] for a in present}
    buckets["non_registered"] = []

    for _prio, h, foreign in enriched:
        left = float(h.get("allocation", 0.0) or 0.0)
        if left <= 0:
            continue
        category = h.get("category")
        for acc in _preferred_order(foreign, present):
            if left <= 0:
                break
            avail = remaining.get(acc, 0.0)
            if avail <= 0:
                continue
            take = min(left, avail)
            buckets[acc].append({
                "ticker": h.get("ticker"),
                "name": h.get("name"),
                "amount": round(take, 2),
                "reason": _reason(category, foreign, acc, overflow=False),
            })
            remaining[acc] -= take
            left -= take
        if left > 0.01:  # overflow to the taxable account
            buckets["non_registered"].append({
                "ticker": h.get("ticker"),
                "name": h.get("name"),
                "amount": round(left, 2),
                "reason": _reason(category, foreign, "non_registered", overflow=True),
            })

    # Assemble account output (skip empty non_registered unless user holds one).
    out_accounts = []
    for acc in present:
        items = buckets[acc]
        total = round(sum(i["amount"] for i in items), 2)
        out_accounts.append({
            "type": acc,
            "label": _ACCOUNT_LABELS[acc],
            "room": round(float(rooms[acc]), 2),
            "room_used": total,
            "total": total,
            "holdings": items,
        })
    non_reg_items = buckets["non_registered"]
    non_reg_total = round(sum(i["amount"] for i in non_reg_items), 2)
    if non_reg_items or has_non_reg:
        out_accounts.append({
            "type": "non_registered",
            "label": _ACCOUNT_LABELS["non_registered"],
            "room": None,
            "room_used": non_reg_total,
            "total": non_reg_total,
            "holdings": non_reg_items,
        })

    invested = round(sum(float(h.get("allocation", 0.0) or 0.0) for h in holdings), 2)
    sheltered = round(sum(a["total"] for a in out_accounts if a["type"] != "non_registered"), 2)
    pct = round(sheltered / invested, 4) if invested else 0.0

    # Human-readable summary.
    def _money(x: float) -> str:
        return f"${x:,.0f}"

    if invested <= 0:
        summary = "This plan holds no funds to place across your accounts."
    elif non_reg_total <= 0.01:
        summary = (f"All {_money(invested)} of this plan fits in your registered accounts — "
                   f"the most heavily taxed funds (bonds and REITs first) were sheltered, "
                   f"leaving nothing exposed to tax.")
    else:
        tail = ("into a non-registered account" if has_non_reg
                else "and would need a non-registered account")
        summary = (f"Sheltered {_money(sheltered)} of {_money(invested)} "
                   f"({round(pct * 100)}%); the remaining {_money(non_reg_total)} overflowed "
                   f"{tail}. Bonds and REITs were prioritized into your registered room because "
                   f"their income is taxed most heavily.")

    return {
        "accounts": out_accounts,
        "invested": invested,
        "sheltered_amount": sheltered,
        "sheltered_pct": pct,
        "unsheltered_amount": non_reg_total,
        "summary": summary,
        "assumptions": _ASSUMPTIONS,
        "disclaimer": _DISCLAIMER,
    }
