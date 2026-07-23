"""
Deterministic multi-pass invoice / bank matching (no LLM).

Used by GSTR-2B Tier-1 + deep-match and bank Tier-2.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Literal

import rapidfuzz

ReasonCode = Literal["EXACT", "FUZZY_INV", "AMT_DATE", "CROSS_GSTIN", "PARTIAL", "NONE"]
ReconStatus = Literal["matched", "mismatch", "missing_in_2b"]


@dataclass(frozen=True)
class MatchResult:
    status: ReconStatus | Literal["suggested", "none"]
    score: float
    reason_code: ReasonCode
    paired_key: str | None = None
    error_message: str | None = None


def clean_str(s: Any) -> str:
    """
    Normalize GSTIN / invoice tokens: upper, strip - / spaces,
    collapse leading zeros after a non-digit.
    """
    if not s:
        return ""
    s = str(s).strip().upper().replace("-", "").replace("/", "").replace(" ", "")
    return re.sub(r"(\D)0+(\d)", r"\1\2", s)


def normalize_invoice_number(s: Any) -> str:
    """Stronger invoice# normalize: strip INV/Bill prefixes, #, leading zeros."""
    if not s:
        return ""
    raw = str(s).strip().upper()
    raw = re.sub(r"^(INV|INVOICE|BILL|TAX\s*INV|TI)[\s.\-:/]*", "", raw)
    raw = raw.replace("#", "")
    cleaned = clean_str(raw)
    # Strip leading zeros from purely numeric invoice numbers
    if cleaned.isdigit():
        cleaned = cleaned.lstrip("0") or "0"
    else:
        cleaned = re.sub(r"^0+(\d)", r"\1", cleaned)
    return cleaned


def pan_from_gstin(gstin: Any) -> str:
    """GSTIN positions 3–12 are PAN (0-indexed 2:12)."""
    g = clean_str(gstin)
    if len(g) >= 12:
        return g[2:12]
    return ""


def _parse_date(value: Any) -> date | None:
    if value is None or value == "" or (isinstance(value, float) and value != value):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    if not s or s.lower() == "nan":
        return None
    # ISO first
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    m = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(y, mo, d)
        except ValueError:
            return None
    return None


def dates_within(a: Any, b: Any, days: int = 3) -> bool:
    da, db = _parse_date(a), _parse_date(b)
    if not da or not db:
        return False
    return abs((da - db).days) <= days


def amount_close(a: Any, b: Any, tol: float) -> bool:
    try:
        return abs(float(a or 0) - float(b or 0)) <= float(tol)
    except (TypeError, ValueError):
        return False


def score_invoice_pair(
    pr: dict,
    b2b: dict,
    *,
    amount_tol: float = 1.0,
    allow_cross_gstin: bool = True,
) -> MatchResult:
    """
    Ordered passes for one PR invoice vs one GSTR-2B record.

    Keys expected on pr: supplier_gstin, invoice_number, taxable_amount, invoice_date
    Keys on b2b: supplier_gstin, invoice_number, taxable_value, invoice_date
    """
    pr_gstin = clean_str(pr.get("supplier_gstin"))
    b2b_gstin = clean_str(b2b.get("supplier_gstin"))
    pr_inv = normalize_invoice_number(pr.get("invoice_number"))
    b2b_inv = normalize_invoice_number(b2b.get("invoice_number"))
    pr_amt = pr.get("taxable_amount")
    b2b_amt = b2b.get("taxable_value")
    paired = b2b_inv or clean_str(b2b.get("invoice_number"))

    same_gstin = bool(pr_gstin and b2b_gstin and pr_gstin == b2b_gstin)
    same_pan = bool(
        allow_cross_gstin
        and pan_from_gstin(pr_gstin)
        and pan_from_gstin(pr_gstin) == pan_from_gstin(b2b_gstin)
    )

    # Pass 1: exact normalized invoice + GSTIN
    if same_gstin and pr_inv and b2b_inv and pr_inv == b2b_inv:
        if amount_close(pr_amt, b2b_amt, amount_tol):
            return MatchResult("matched", 100.0, "EXACT", paired)
        return MatchResult(
            "mismatch",
            95.0,
            "EXACT",
            paired,
            error_message="Amount/Invoice Mismatch",
        )

    # Pass 2: fuzzy invoice# same GSTIN
    if same_gstin and pr_inv and b2b_inv:
        score = float(rapidfuzz.fuzz.ratio(pr_inv, b2b_inv))
        # Also accept Levenshtein distance ≤ 2 on short-ish numbers
        try:
            from rapidfuzz.distance import Levenshtein

            dist = Levenshtein.distance(pr_inv, b2b_inv)
        except Exception:
            dist = 99
        if score >= 90.0 or dist <= 2:
            if amount_close(pr_amt, b2b_amt, amount_tol):
                return MatchResult("matched", max(score, 90.0), "FUZZY_INV", paired)
            if score >= 75.0:
                return MatchResult(
                    "mismatch",
                    score,
                    "FUZZY_INV",
                    paired,
                    error_message="Amount/Invoice Mismatch",
                )
        elif score >= 75.0:
            return MatchResult(
                "mismatch",
                score,
                "FUZZY_INV",
                paired,
                error_message="Amount/Invoice Mismatch",
            )

    # Pass 3: amount + date ±3d same GSTIN (invoice# weak)
    if same_gstin and amount_close(pr_amt, b2b_amt, amount_tol):
        if dates_within(pr.get("invoice_date"), b2b.get("invoice_date"), 3):
            inv_score = (
                float(rapidfuzz.fuzz.ratio(pr_inv, b2b_inv)) if pr_inv and b2b_inv else 50.0
            )
            if inv_score >= 60.0 or not pr_inv or not b2b_inv:
                return MatchResult(
                    "matched",
                    max(80.0, inv_score),
                    "AMT_DATE",
                    paired,
                )

    # Pass 4: cross-GSTIN same PAN + amount/date (typo GSTIN)
    if allow_cross_gstin and same_pan and not same_gstin:
        if amount_close(pr_amt, b2b_amt, amount_tol) and dates_within(
            pr.get("invoice_date"), b2b.get("invoice_date"), 3
        ):
            inv_score = (
                float(rapidfuzz.fuzz.ratio(pr_inv, b2b_inv)) if pr_inv and b2b_inv else 70.0
            )
            if inv_score >= 70.0 or (pr_inv and b2b_inv and pr_inv == b2b_inv):
                return MatchResult(
                    "matched",
                    max(85.0, inv_score),
                    "CROSS_GSTIN",
                    paired,
                )

    return MatchResult("none", 0.0, "NONE", None)


def best_b2b_match(
    pr: dict,
    b2b_candidates: list[dict],
    *,
    amount_tol: float = 1.0,
    allow_cross_gstin: bool = False,
    min_consider_score: float = 75.0,
) -> MatchResult:
    """
    Greedy best among candidates. Prefer matched > mismatch > none;
    among equals, higher score wins.
    """
    best: MatchResult = MatchResult("none", 0.0, "NONE", None)
    rank = {"matched": 2, "mismatch": 1, "none": 0, "suggested": 0}

    for b2b in b2b_candidates:
        result = score_invoice_pair(
            pr, b2b, amount_tol=amount_tol, allow_cross_gstin=allow_cross_gstin
        )
        if result.status == "none" and result.score < min_consider_score:
            # still track fuzzy-only scores for mismatch threshold path
            pass
        br = rank.get(best.status, 0)
        rr = rank.get(result.status, 0)
        if rr > br or (rr == br and result.score > best.score):
            best = result
    return best


def match_pr_to_b2b(
    pr_list: list[dict],
    b2b_list: list[dict],
    *,
    amount_tol: float = 1.0,
    period: str | None = None,
    allow_cross_gstin: bool = False,
) -> list[dict]:
    """
    1:1 greedy match within a candidate pool. Returns invoice update dicts:
    {id, recon_status, recon_period?, error_message?, reason_code?}
    """
    remaining = list(b2b_list)
    updates: list[dict] = []

    for inv in pr_list:
        if not remaining:
            if not inv.get("recon_status") or inv.get("recon_status") in (
                "unreconciled",
                "missing_in_2b",
            ):
                updates.append(
                    {
                        "id": inv["id"],
                        "recon_status": "missing_in_2b",
                        "recon_period": period,
                        "error_message": None,
                        "reason_code": "NONE",
                    }
                )
            continue

        best_idx = -1
        best_result = MatchResult("none", 0.0, "NONE", None)
        rank = {"matched": 2, "mismatch": 1, "none": 0}

        for i, b2b in enumerate(remaining):
            result = score_invoice_pair(
                inv, b2b, amount_tol=amount_tol, allow_cross_gstin=allow_cross_gstin
            )
            br = rank.get(best_result.status, 0)
            rr = rank.get(result.status, 0)
            if rr > br or (rr == br and result.score > best_result.score):
                best_result = result
                best_idx = i

        if best_idx >= 0 and best_result.status in ("matched", "mismatch"):
            updates.append(
                {
                    "id": inv["id"],
                    "recon_status": best_result.status,
                    "recon_period": period,
                    "error_message": best_result.error_message,
                    "reason_code": best_result.reason_code,
                }
            )
            remaining.pop(best_idx)
        else:
            if not inv.get("recon_status") or inv.get("recon_status") in (
                "unreconciled",
                "missing_in_2b",
            ):
                updates.append(
                    {
                        "id": inv["id"],
                        "recon_status": "missing_in_2b",
                        "recon_period": period,
                        "error_message": None,
                        "reason_code": "NONE",
                    }
                )

    return updates


def _tokenize_name(s: str) -> set[str]:
    s = (s or "").lower()
    parts = re.findall(r"[a-z0-9]{3,}", s)
    stop = {"ltd", "limited", "pvt", "private", "the", "and", "india", "corp", "company"}
    return {p for p in parts if p not in stop}


def score_bank_to_invoice(
    txn: dict,
    inv: dict,
    *,
    amount_tol: float = 1.0,
) -> MatchResult:
    """
    Bank withdrawal ↔ unpaid invoice.
    Passes: amount ±tol + name overlap; optional UTR/cheque token in narration.
    """
    remaining_bank = float(txn.get("withdrawal") or 0) - float(txn.get("allocated_amount") or 0)
    remaining_inv = float(inv.get("total_amount") or 0) - float(inv.get("paid_amount") or 0)
    if remaining_bank <= 0 or remaining_inv <= 0:
        return MatchResult("none", 0.0, "NONE")

    amt_ok = abs(remaining_bank - remaining_inv) <= amount_tol
    partial = remaining_bank + amount_tol < remaining_inv and remaining_bank > 0

    desc = (txn.get("description") or "").lower()
    ref = (txn.get("reference_no") or "").lower()
    narr = f"{desc} {ref}"
    sup = (inv.get("supplier_name") or "").lower().strip()

    name_ok = False
    if sup and narr:
        if len(sup) < 4:
            name_ok = sup == desc.strip()
        else:
            name_ok = sup in narr or any(
                t in narr for t in _tokenize_name(sup) if len(t) >= 4
            )
            # fuzzy supplier vs narration
            if not name_ok:
                score = rapidfuzz.fuzz.partial_ratio(sup, narr)
                name_ok = score >= 80

    # Reference / invoice number token in narration
    inv_no = normalize_invoice_number(inv.get("invoice_number"))
    ref_hit = bool(inv_no and len(inv_no) >= 4 and inv_no.lower() in narr.replace(" ", ""))

    if amt_ok and (name_ok or ref_hit):
        return MatchResult(
            "suggested",
            95.0 if name_ok and ref_hit else 88.0,
            "EXACT" if name_ok and amt_ok else "FUZZY_INV",
            paired_key=inv.get("id"),
        )

    if partial and name_ok and remaining_bank >= 1:
        return MatchResult(
            "suggested",
            82.0,
            "PARTIAL",
            paired_key=inv.get("id"),
        )

    if amt_ok and dates_within(txn.get("txn_date"), inv.get("invoice_date"), 7) and name_ok:
        return MatchResult(
            "suggested",
            85.0,
            "AMT_DATE",
            paired_key=inv.get("id"),
        )

    return MatchResult("none", 0.0, "NONE")


def match_bank_leftovers(
    leftover_txns: list[dict],
    unpaid_invoices: list[dict],
    *,
    amount_tol: float = 1.0,
) -> list[dict]:
    """
    Returns suggestion dicts ready for reconciliation_matches insert:
    {invoice_id, bank_transaction_id, match_type, allocated_amount, confidence}
    """
    used_inv: set[str] = set()
    used_txn: set[str] = set()
    out: list[dict] = []

    # Score all pairs, take greedily by score
    scored: list[tuple[float, dict, dict, MatchResult]] = []
    for txn in leftover_txns:
        if not txn.get("withdrawal"):
            continue
        for inv in unpaid_invoices:
            result = score_bank_to_invoice(txn, inv, amount_tol=amount_tol)
            if result.status == "suggested" and result.score >= 80:
                scored.append((result.score, txn, inv, result))

    scored.sort(key=lambda x: x[0], reverse=True)
    for _score, txn, inv, result in scored:
        tid, iid = txn["id"], inv["id"]
        if tid in used_txn or iid in used_inv:
            continue
        remaining_bank = float(txn.get("withdrawal") or 0) - float(
            txn.get("allocated_amount") or 0
        )
        remaining_inv = float(inv.get("total_amount") or 0) - float(
            inv.get("paid_amount") or 0
        )
        alloc = min(remaining_bank, remaining_inv)
        match_type = "PARTIAL" if result.reason_code == "PARTIAL" else "EXACT"
        if result.reason_code in ("FUZZY_INV", "AMT_DATE"):
            match_type = "PARTIAL"
        out.append(
            {
                "invoice_id": iid,
                "bank_transaction_id": tid,
                "match_type": match_type,
                "allocated_amount": round(alloc, 2),
                "confidence": result.score / 100.0,
                "reason_code": result.reason_code,
            }
        )
        used_txn.add(tid)
        used_inv.add(iid)

    return out
