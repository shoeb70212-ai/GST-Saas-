"""
Hermetic synthetic fixture gate for Phase 5 CI.

No LLM calls. Scores identity predictions via bench.score_one and checks
tax arithmetic / auto-accept policy on fixture expected.json files.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from bench.run_bench import score_one  # noqa: E402
from extraction import apply_tax_calculations, compute_confidence  # noqa: E402
from validators import validate_tax_arithmetic  # noqa: E402

FIXTURES = BACKEND / "tests" / "fixtures" / "invoices"
MANIFEST = FIXTURES / "manifest.json"

FIELD_KEYS = (
    "Supplier_GSTIN",
    "Supplier_Name",
    "Buyer_GSTIN",
    "Buyer_Name",
    "Invoice_Number",
    "Invoice_Date",
    "Invoice_Type",
    "Taxable_Amount",
    "CGST_Amount",
    "SGST_Amount",
    "IGST_Amount",
    "Cess_Amount",
    "Round_Off",
    "Total_Amount",
    "Line_Items",
)


def _load_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def _load_expected(case: dict) -> dict:
    path = FIXTURES / case["path"] / "expected.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _extract_fields(expected: dict) -> dict:
    return {k: expected[k] for k in FIELD_KEYS if k in expected}


def _as_label(case_id: str, expected: dict) -> dict:
    fields = _extract_fields(expected)
    return {
        "id": case_id,
        "source_file": f"{case_id}/source",
        "fields": fields,
        "critical_fields": expected.get("critical_fields")
        or [
            "Supplier_GSTIN",
            "Invoice_Number",
            "Invoice_Date",
            "Taxable_Amount",
            "Total_Amount",
        ],
    }


class TestSyntheticBenchGate:
    def test_manifest_cases_present(self):
        m = _load_manifest()
        assert len(m["cases"]) >= 12

    def test_identity_score_perfect_on_all_cases(self):
        m = _load_manifest()
        for case in m["cases"]:
            expected = _load_expected(case)
            fields = _extract_fields(expected)
            if not fields:
                continue
            label = _as_label(case["id"], expected)
            result = score_one(fields, label)
            assert result["critical_accuracy"] == 1.0, (
                f"{case['id']} identity score failed: {result['misses']}"
            )

    def test_must_match_math_cases_pass_tax_arithmetic(self):
        m = _load_manifest()
        checked = 0
        for case in m["cases"]:
            expected = _load_expected(case)
            if not expected.get("must_match_math"):
                continue
            fields = _extract_fields(expected)
            math = validate_tax_arithmetic(fields)
            assert math["ok"] is True, f"{case['id']} tax issues: {math['issues']}"
            checked += 1
        assert checked >= 1

    def test_math_broken_never_auto_accepted(self):
        m = _load_manifest()
        case = next(c for c in m["cases"] if c["id"] == "math_broken")
        expected = _load_expected(case)
        assert expected.get("must_not_auto_accept") is True
        gt = expected.get("ground_truth_extract") or _extract_fields(expected)
        scored = apply_tax_calculations(dict(gt))
        conf = compute_confidence(scored, scored.get("Total_Amount"))
        assert conf["state"] != "auto_accepted"

    def test_run_bench_fail_under_and_require_labels(self, tmp_path: Path):
        """CLI exits non-zero on empty labels with --require-labels."""
        import subprocess

        empty = tmp_path / "labels"
        empty.mkdir()
        proc = subprocess.run(
            [
                sys.executable,
                "-m",
                "bench.run_bench",
                "--labels",
                str(empty),
                "--require-labels",
            ],
            cwd=str(BACKEND),
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONPATH": str(BACKEND)},
        )
        assert proc.returncode == 1

    def test_run_bench_fail_under_threshold(self, tmp_path: Path):
        import subprocess

        labels = tmp_path / "labels"
        labels.mkdir()
        label = {
            "id": "t1",
            "source_file": "t1.pdf",
            "fields": {
                "Invoice_Number": "A",
                "Total_Amount": 100.0,
            },
            "critical_fields": ["Invoice_Number", "Total_Amount"],
        }
        (labels / "t1.json").write_text(json.dumps(label), encoding="utf-8")
        pred = tmp_path / "pred.jsonl"
        # One hit, one miss → accuracy 0.5
        pred.write_text(
            json.dumps(
                {
                    "id": "t1",
                    "Invoice_Number": "A",
                    "Total_Amount": 999.0,
                }
            )
            + "\n",
            encoding="utf-8",
        )
        proc = subprocess.run(
            [
                sys.executable,
                "-m",
                "bench.run_bench",
                "--labels",
                str(labels),
                "--predictions",
                str(pred),
                "--fail-under",
                "0.98",
            ],
            cwd=str(BACKEND),
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONPATH": str(BACKEND)},
        )
        assert proc.returncode == 1
        assert "fail-under" in proc.stdout.lower() or "ERROR" in proc.stdout


class TestSemaphoreEnvDefaults:
    def test_defaults_when_env_unset(self, monkeypatch: pytest.MonkeyPatch):
        import extraction as ext

        monkeypatch.delenv("AI_SEMAPHORE_LIMIT", raising=False)
        monkeypatch.delenv("FILE_SEMAPHORE_LIMIT", raising=False)
        monkeypatch.setattr(ext, "_ai_semaphore", None)
        monkeypatch.setattr(ext, "_file_processing_semaphore", None)
        assert ext._env_int("AI_SEMAPHORE_LIMIT", 5) == 5
        assert ext._env_int("FILE_SEMAPHORE_LIMIT", 4) == 4
        ai = ext.get_ai_semaphore()
        file_sem = ext.get_file_processing_semaphore()
        assert ai._value == 5  # type: ignore[attr-defined]
        assert file_sem._value == 4  # type: ignore[attr-defined]

    def test_env_override(self, monkeypatch: pytest.MonkeyPatch):
        import extraction as ext

        monkeypatch.setenv("AI_SEMAPHORE_LIMIT", "3")
        monkeypatch.setenv("FILE_SEMAPHORE_LIMIT", "2")
        monkeypatch.setattr(ext, "_ai_semaphore", None)
        monkeypatch.setattr(ext, "_file_processing_semaphore", None)
        assert ext.get_ai_semaphore()._value == 3  # type: ignore[attr-defined]
        assert ext.get_file_processing_semaphore()._value == 2  # type: ignore[attr-defined]
