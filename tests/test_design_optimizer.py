import pytest
from src.design import optimize_design, design_scores, OBJECTIVES


def test_optimize_returns_correct_shape():
    out = optimize_design(L_mm=100, R1_mm=500, R2_mm=500, F=1000, f_mod_mhz=50)
    assert "history" in out
    assert "result" in out
    assert isinstance(out["history"], list)
    r = out["result"]
    for key in ("L_mm", "R1_mm", "R2_mm", "F", "f_mod_mhz", "scores", "total"):
        assert key in r


def test_optimize_does_not_worsen_score():
    start = dict(L_mm=100, R1_mm=500, R2_mm=500, F=1000, f_mod_mhz=50)
    s0 = design_scores(**start)["total"]
    out = optimize_design(**start)
    assert out["result"]["total"] >= s0 - 1e-9


def test_optimize_improves_bad_stability():
    # Near-concentric: g = 1 - 200/102 ≈ -0.96, g1*g2 ≈ 0.92 (near boundary)
    start = dict(L_mm=200, R1_mm=102, R2_mm=102, F=1000, f_mod_mhz=30)
    s0 = design_scores(**start)["stability"]
    out = optimize_design(**start)
    assert out["result"]["scores"]["stability"] >= s0 - 1e-9


def test_optimize_respects_lower_bounds():
    out = optimize_design(L_mm=10, R1_mm=50, R2_mm=50, F=10, f_mod_mhz=1)
    r = out["result"]
    assert r["L_mm"] >= 10.0
    assert r["R1_mm"] >= 50.0
    assert r["R2_mm"] >= 50.0
    assert r["F"] >= 10.0
    assert r["f_mod_mhz"] >= 1.0


def test_optimize_history_has_strings():
    out = optimize_design(L_mm=100, R1_mm=500, R2_mm=500, F=1000, f_mod_mhz=50)
    for line in out["history"]:
        assert isinstance(line, str)
