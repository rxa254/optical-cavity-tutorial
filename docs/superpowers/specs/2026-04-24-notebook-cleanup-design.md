# Notebook Cleanup & Decision-Tree Algorithm — Design Spec
**Date:** 2026-04-24  
**Scope:** `notebook.ipynb` (narrative additions to Sections 1 and 3) + `src/design.py` (optimizer) + new Section 7 code cell

---

## 1. Narrative additions

### 1.1 Section 1 — Introduction

Add one paragraph before the running-examples table. Content:

- Why build a cavity at all: converts ordinary mirrors into a high-reflectivity filter, stores photons for ~F/π round trips, amplifies the intracavity field by the finesse relative to the input.
- One-sentence feedback-loop framing: each round trip the field interferes with itself; resonance is the condition where this interference is constructive.
- No new equations. No derivations. Cite Yariv §4 and Siegman §11.

### 1.2 Section 3 — Stability

Add one paragraph after the Gouy phase equation (after the special-operating-points table). Content:

- Physical consequence of proximity to the stability boundary: beam sizes diverge, alignment sensitivity increases sharply, lock acquisition becomes difficult. The stability *margin* (min distance of g1·g2 from 0 and 1) is the practical figure of merit.
- LIGO arm cavity context (one to two sentences): both mirrors concave, R slightly greater than L/2, so both g-parameters are negative. Product g1·g2 ≈ 0.85 keeps the design firmly inside the stable region. The large beam size that results averages over mirror surface figure errors — this is the physical motivation for the operating point choice.
- Cite Siegman Chapters 19–21 and relevant LIGO T-docs.

---

## 2. Greedy optimizer

### 2.1 `src/design.py` — new function `optimize_design`

**Signature:**
```python
def optimize_design(
    L_mm: float,
    R1_mm: float,
    R2_mm: float,
    F: float,
    f_mod_mhz: float,
    weights: dict | None = None,
    n_cycles: int = 3,
) -> dict:
```

**Returns:** `{"history": list[str], "result": dict}`  
- `history`: one human-readable string per accepted move  
- `result`: `{L_mm, R1_mm, R2_mm, F, f_mod_mhz, scores, total}`

**Algorithm — coordinate-descent greedy:**

```
for cycle in range(n_cycles):
    step_fraction = 0.10 / 2**cycle   # 10%, 5%, 2.5%
    for each parameter p in [L_mm, R1_mm, R2_mm, F, f_mod_mhz]:
        try p * (1 + step_fraction) and p * (1 - step_fraction)
        accept the move (if any) that improves total weighted score
        log: "↑ L_mm  100 → 110 mm  (stability 0.71 → 0.83, total 0.62 → 0.67)"
        skip move if it takes parameter outside allowed bounds
```

**Parameter bounds:**
| Parameter | Min | Max |
|-----------|-----|-----|
| L_mm | 10 | 5000 |
| R1_mm | 50 | 1e6 |
| R2_mm | 50 | 1e6 |
| F | 10 | 1e5 |
| f_mod_mhz | 1 | 500 |

**Termination:** after `n_cycles` cycles, or early if a full cycle produces no accepted move.

**Score function:** calls existing `design_scores(L_mm, R1_mm, R2_mm, F, f_mod_mhz, weights)`.

### 2.2 Section 7 — heuristic prose (new markdown cell)

New markdown block inserted between the existing decision-tree markdown and the existing widget. Approximately 150 words covering the 5-step written recipe:

1. **Stability first** — choose ROCs and length so g1·g2 ∈ [0.3, 0.7]. Stability is a hard constraint; everything else is secondary.
2. **Set finesse** — high finesse gives narrow linewidth (better PDH) and high buildup, but makes HOM accidental resonances more dangerous.
3. **Choose modulation frequency** — must satisfy f_mod ≫ δν (at least 10×). Given finesse and length, this sets the minimum f_mod.
4. **Check HOM avoidance** — scan the Gouy phase (Section 6 widget) and confirm no sideband harmonic falls within a few linewidths of any HOM order up to q = 5.
5. **Iterate** — the greedy optimizer below formalises this loop. Each accepted move corresponds to one of the above steps.

### 2.3 Section 7 — new optimizer code cell

Position: after the existing interactive widget cell, before the empty trailing cell.

Content:
```python
# ── Greedy design optimizer ──────────────────────────────────────────────────
# Starting point: current widget values (edit manually or run the widget first)
from src.design import optimize_design

_start = dict(
    L_mm=_L7.value, R1_mm=_R1_7.value, R2_mm=_R2_7.value,
    F=_F7.value, f_mod_mhz=_fm7.value,
)
_weights = {k: _WS[k].value for k, _ in OBJECTIVES}

_opt = optimize_design(**_start, weights=_weights)

print("=== Greedy optimizer log ===")
for line in _opt["history"]:
    print(line)

print("\n=== Result ===")
r = _opt["result"]
print(f"{'Parameter':<14}  {'Start':>10}  {'Optimized':>10}")
print(f"{'L (mm)':<14}  {_start['L_mm']:>10.1f}  {r['L_mm']:>10.1f}")
print(f"{'R1 (mm)':<14}  {_start['R1_mm']:>10.1f}  {r['R1_mm']:>10.1f}")
print(f"{'R2 (mm)':<14}  {_start['R2_mm']:>10.1f}  {r['R2_mm']:>10.1f}")
print(f"{'Finesse':<14}  {_start['F']:>10.0f}  {r['F']:>10.0f}")
print(f"{'f_mod (MHz)':<14}  {_start['f_mod_mhz']:>10.1f}  {r['f_mod_mhz']:>10.1f}")
print(f"\n{'Objective':<20}  {'Start':>8}  {'Optimized':>10}")
for k, lbl in OBJECTIVES:
    s0 = design_scores(_start['L_mm'], _start['R1_mm'], _start['R2_mm'],
                       _start['F'], _start['f_mod_mhz'])[k]
    print(f"{lbl:<20}  {s0:>8.3f}  {r['scores'][k]:>10.3f}")
print(f"\n{'Total':<20}  {design_scores(**_start)['total']:>8.3f}  {r['total']:>10.3f}")
```

---

## 3. Files changed

| File | Change |
|------|--------|
| `notebook.ipynb` | Add narrative to `sect1-head` and `sect3-head` cells; add heuristic markdown cell + optimizer code cell in Section 7 |
| `src/design.py` | Add `optimize_design` function |
| `CHANGELOG.md` | Session entry |

## 4. Out of scope

- No changes to sections 2, 4, 5, 6
- No changes to other `src/` modules
- No new dependencies
- No animation, no scipy optimizer, no random restarts
