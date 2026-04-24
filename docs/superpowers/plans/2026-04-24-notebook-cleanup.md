# Notebook Cleanup & Greedy Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pedagogical narrative to Sections 1 and 3, add a 5-step heuristic recipe and greedy optimizer to Section 7, and implement `optimize_design` in `src/design.py`.

**Architecture:** Pure Python function added to existing `src/design.py`; notebook cells edited by direct JSON manipulation via a helper script; no new dependencies.

**Tech Stack:** Python 3, NumPy, `json` stdlib, `ipywidgets`, `matplotlib`, `pytest`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/design.py` | Modify | Add `optimize_design` function |
| `tests/test_design_optimizer.py` | Create | Unit tests for `optimize_design` |
| `notebook.ipynb` | Modify | Narrative in §1, §3; new markdown + code cells in §7 |
| `CHANGELOG.md` | Modify | Session log entry |

---

## Task 1: Add `optimize_design` to `src/design.py`

**Files:**
- Modify: `src/design.py` (append after `design_scores`)
- Create: `tests/__init__.py` (empty)
- Create: `tests/test_design_optimizer.py`

- [ ] **Step 1: Create tests directory and write failing tests**

```bash
mkdir -p /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial/tests
touch /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial/tests/__init__.py
```

Create `tests/test_design_optimizer.py`:

```python
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
    # Start at the lower bound edges — optimizer must not go below them
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
```

- [ ] **Step 2: Run tests to confirm they fail (function not yet defined)**

```bash
cd /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial
python -m pytest tests/test_design_optimizer.py -v 2>&1 | head -30
```

Expected: `ImportError` or `AttributeError: module 'src.design' has no attribute 'optimize_design'`

- [ ] **Step 3: Implement `optimize_design` in `src/design.py`**

Append the following to the end of `src/design.py` (after `design_scores`):

```python

_BOUNDS = {
    'L_mm':      (10.0,   5_000.0),
    'R1_mm':     (50.0,   1_000_000.0),
    'R2_mm':     (50.0,   1_000_000.0),
    'F':         (10.0,   100_000.0),
    'f_mod_mhz': (1.0,    500.0),
}
_UNITS = {'L_mm': 'mm', 'R1_mm': 'mm', 'R2_mm': 'mm', 'F': '', 'f_mod_mhz': 'MHz'}
_NAMES = {'L_mm': 'L', 'R1_mm': 'R₁', 'R2_mm': 'R₂', 'F': 'Finesse', 'f_mod_mhz': 'f_mod'}


def optimize_design(
    L_mm: float,
    R1_mm: float,
    R2_mm: float,
    F: float,
    f_mod_mhz: float,
    weights=None,
    n_cycles: int = 3,
) -> dict:
    """
    Greedy coordinate-descent optimizer over the five cavity design parameters.

    Each cycle steps through [L_mm, R1_mm, R2_mm, F, f_mod_mhz] and tries a
    fractional nudge (±10%, halved each cycle).  Moves that improve the weighted
    total score are accepted and logged.  Stops early if a full cycle yields no
    improvement.

    Returns {'history': list[str], 'result': dict}.
    result keys: L_mm, R1_mm, R2_mm, F, f_mod_mhz, scores (dict), total (float).
    """
    if weights is None:
        weights = {k: 1.0 for k, _ in OBJECTIVES}

    params = dict(L_mm=L_mm, R1_mm=R1_mm, R2_mm=R2_mm, F=F, f_mod_mhz=f_mod_mhz)
    history = []

    def _total(p):
        return design_scores(
            p['L_mm'], p['R1_mm'], p['R2_mm'], p['F'], p['f_mod_mhz'],
            weights=weights,
        )['total']

    for cycle in range(n_cycles):
        step = 0.10 / (2 ** cycle)
        improved_this_cycle = False

        for key in ['L_mm', 'R1_mm', 'R2_mm', 'F', 'f_mod_mhz']:
            cur_val   = params[key]
            cur_total = _total(params)
            lo, hi    = _BOUNDS[key]

            best_val   = cur_val
            best_total = cur_total
            best_dir   = None

            for direction, new_val in [('+', cur_val * (1 + step)),
                                        ('-', cur_val * (1 - step))]:
                if not (lo <= new_val <= hi):
                    continue
                trial_total = _total({**params, key: new_val})
                if trial_total > best_total:
                    best_total = trial_total
                    best_val   = new_val
                    best_dir   = direction

            if best_dir is not None:
                fmt  = '.0f' if key == 'F' else '.1f'
                line = (
                    f"{'↑' if best_dir == '+' else '↓'} {_NAMES[key]}: "
                    f"{cur_val:{fmt}}{_UNITS[key]} → {best_val:{fmt}}{_UNITS[key]}"
                    f"  [total {cur_total:.3f} → {best_total:.3f}]"
                )
                history.append(line)
                params[key] = best_val
                improved_this_cycle = True

        if not improved_this_cycle:
            history.append(f"(cycle {cycle + 1}: no improvement — stopping early)")
            break
        else:
            history.append(f"(cycle {cycle + 1} complete, step = {step * 100:.1f}%)")

    final = design_scores(
        params['L_mm'], params['R1_mm'], params['R2_mm'],
        params['F'], params['f_mod_mhz'], weights=weights,
    )
    return {
        'history': history,
        'result':  {**params, 'scores': final, 'total': final['total']},
    }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial
python -m pytest tests/test_design_optimizer.py -v
```

Expected: 5 tests, all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/design.py tests/__init__.py tests/test_design_optimizer.py
git commit -m "feat: add optimize_design greedy optimizer to src/design.py"
```

---

## Task 2: Add narrative to Section 1 of the notebook

**Files:**
- Modify: `notebook.ipynb` (cell `sect1-head`)

The current `sect1-head` cell ends with the running-examples table. Insert a motivating paragraph between the existing intro text and `**Running examples...**`.

- [ ] **Step 1: Edit the `sect1-head` markdown cell**

In `notebook.ipynb`, find the `sect1-head` cell source. Replace:

```
Along the way you will see how five coupled quantities: \nfinesse, FSR, linewidth, power buildup, and mode structure\nconstrain every design choice.\n\n**Running examples used throughout:**
```

with:

```
Along the way you will see how five coupled quantities: \nfinesse, FSR, linewidth, power buildup, and mode structure\nconstrain every design choice.\n\n**Why build a cavity?**\nA cavity multiplies the effective reflectivity of ordinary mirrors: a mirror with\n$R = 0.99$ alone transmits 1% per pass, but the same mirror at finesse $\\mathcal{F} = 300$\nstores each photon for $\\sim\\mathcal{F}/\\pi \\approx 100$ round trips and amplifies the\nintracavity field by $\\sim\\mathcal{F}/\\pi$ over the input.  This buildup underpins laser gain,\nspectroscopic sensitivity, and gravitational-wave signal recycling alike.\nThe mechanism is simple: each round trip the field interferes with itself;\nresonance is the condition where that interference is everywhere constructive.\n*(References: Yariv, §4; Siegman, §11.)*\n\n**Running examples used throughout:**
```

Use this Python one-liner to do the edit safely:

```bash
cd /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial
python - <<'EOF'
import json, pathlib

nb = json.loads(pathlib.Path("notebook.ipynb").read_text())
for cell in nb["cells"]:
    if cell.get("id") == "sect1-head":
        src = "".join(cell["source"])
        old = "Along the way you will see how five coupled quantities: \nfinesse, FSR, linewidth, power buildup, and mode structure\nconstrain every design choice.\n\n**Running examples used throughout:**"
        new = (
            "Along the way you will see how five coupled quantities: \n"
            "finesse, FSR, linewidth, power buildup, and mode structure\n"
            "constrain every design choice.\n\n"
            "**Why build a cavity?**\n"
            "A cavity multiplies the effective reflectivity of ordinary mirrors: a mirror with\n"
            "$R = 0.99$ alone transmits 1% per pass, but the same mirror at finesse $\\mathcal{F} = 300$\n"
            "stores each photon for $\\sim\\mathcal{F}/\\pi \\approx 100$ round trips and amplifies the\n"
            "intracavity field by $\\sim\\mathcal{F}/\\pi$ over the input.  This buildup underpins laser gain,\n"
            "spectroscopic sensitivity, and gravitational-wave signal recycling alike.\n"
            "The mechanism is simple: each round trip the field interferes with itself;\n"
            "resonance is the condition where that interference is everywhere constructive.\n"
            "*(References: Yariv, §4; Siegman, §11.)*\n\n"
            "**Running examples used throughout:**"
        )
        assert old in src, f"Pattern not found in sect1-head. Current source:\n{src}"
        cell["source"] = list(src.replace(old, new, 1))
        break
else:
    raise ValueError("sect1-head cell not found")

pathlib.Path("notebook.ipynb").write_text(json.dumps(nb, indent=1))
print("Done.")
EOF
```

- [ ] **Step 2: Verify the edit**

```bash
cd /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial
python -c "
import json, pathlib
nb = json.loads(pathlib.Path('notebook.ipynb').read_text())
for cell in nb['cells']:
    if cell.get('id') == 'sect1-head':
        print(''.join(cell['source'])[:800])
        break
"
```

Expected: output contains "Why build a cavity?" paragraph before "Running examples".

- [ ] **Step 3: Commit**

```bash
git add notebook.ipynb
git commit -m "docs: add motivating narrative to Section 1 introduction"
```

---

## Task 3: Add narrative to Section 3 of the notebook

**Files:**
- Modify: `notebook.ipynb` (cell `sect3-head`)

Insert an expanded paragraph explaining the physical consequences of proximity to the stability boundary and the LIGO third-quadrant operating point, replacing the existing thin two-sentence version.

- [ ] **Step 1: Edit the `sect3-head` markdown cell**

```bash
cd /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial
python - <<'EOF'
import json, pathlib

nb = json.loads(pathlib.Path("notebook.ipynb").read_text())
for cell in nb["cells"]:
    if cell.get("id") == "sect3-head":
        src = "".join(cell["source"])
        old = (
            "Practical designs stay well inside the stable region, typically $g_1 g_2 \\in [0.1,\\, 0.9]$.\n"
            "LIGO arm cavities operate in the third quadrant (both $g < 0$) near $g_1 g_2 \\approx 0.85$.\n\n"
            "**Reference:** Siegman, *Lasers*, Chapters 19–21"
        )
        new = (
            "Practical designs stay well inside the stable region, typically $g_1 g_2 \\in [0.1,\\, 0.9]$.\n"
            "Proximity to the stability boundary ($g_1 g_2 = 0$ or $1$) has a concrete physical cost:\n"
            "beam sizes on the mirrors diverge, alignment sensitivity increases sharply, and maintaining\n"
            "a locked cavity becomes mechanically demanding.  The **stability margin**\n"
            "$\\min(g_1 g_2,\\, 1 - g_1 g_2)$ is the practical figure of merit — the wider the margin,\n"
            "the more tolerant the cavity is to mirror tilt and length fluctuations.\n\n"
            "**LIGO arm cavities** operate in the third quadrant ($g_1 < 0$, $g_2 < 0$), near\n"
            "$g_1 g_2 \\approx 0.85$.  Both mirrors are concave with $R_i$ slightly greater than $L/2$,\n"
            "so $g_i = 1 - L/R_i < 0$.  The resulting large beam size ($\\sim 6$ cm on the test masses)\n"
            "averages over mirror surface figure errors and reduces the coupling of scattered light\n"
            "into higher-order modes — the primary physical motivation for this unconventional operating\n"
            "point.  (LIGO-T010075, LIGO-T0900043.)\n\n"
            "**Reference:** Siegman, *Lasers*, Chapters 19–21"
        )
        assert old in src, f"Pattern not found in sect3-head. Current source:\n{src[-500:]}"
        cell["source"] = list(src.replace(old, new, 1))
        break
else:
    raise ValueError("sect3-head cell not found")

pathlib.Path("notebook.ipynb").write_text(json.dumps(nb, indent=1))
print("Done.")
EOF
```

- [ ] **Step 2: Verify the edit**

```bash
cd /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial
python -c "
import json, pathlib
nb = json.loads(pathlib.Path('notebook.ipynb').read_text())
for cell in nb['cells']:
    if cell.get('id') == 'sect3-head':
        src = ''.join(cell['source'])
        assert 'stability margin' in src
        assert 'LIGO arm cavities' in src
        print('Verified: stability margin and LIGO context present.')
        break
"
```

Expected: `Verified: stability margin and LIGO context present.`

- [ ] **Step 3: Commit**

```bash
git add notebook.ipynb
git commit -m "docs: add stability boundary intuition and LIGO context to Section 3"
```

---

## Task 4: Add heuristic prose markdown cell to Section 7

**Files:**
- Modify: `notebook.ipynb` (insert new markdown cell between `566d6b66` and `cd290e77`)

- [ ] **Step 1: Insert heuristic markdown cell**

```bash
cd /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial
python - <<'EOF'
import json, pathlib, uuid

nb = json.loads(pathlib.Path("notebook.ipynb").read_text())
cells = nb["cells"]

# Find index of the decision-tree markdown cell (566d6b66)
idx = next(i for i, c in enumerate(cells) if c.get("id") == "566d6b66")

heuristic_source = """\
### Design algorithm — five-step heuristic

The greedy optimizer below formalises the following recipe. Each step corresponds to one
physical constraint; the ordering reflects which decisions are hardest to undo.

1. **Stability first.** Choose mirror ROCs and cavity length so that
   $g_1 g_2 \\in [0.3, 0.7]$.  Stability is a hard constraint — everything else
   is secondary.  A stability margin below $0.1$ makes the cavity practically
   unlockable.

2. **Set the finesse** (mirror specifications).  High finesse gives a narrow
   linewidth and high power buildup, but it makes accidental HOM resonances more
   damaging (a fixed sideband–HOM frequency gap is now measured in more
   linewidths).  Choose finesse before optimizing the modulation frequency.

3. **Choose the modulation frequency.**  The PDH sideband condition requires
   $f_\\mathrm{mod} \\gg \\delta\\nu$; at least $10\\times$ the linewidth is a safe
   working rule.  Given finesse and cavity length, this sets the *minimum*
   $f_\\mathrm{mod}$.

4. **Check HOM avoidance.**  With $f_\\mathrm{mod}$ set, scan the Gouy phase
   (Section\\u00a06 widget) and confirm that no harmonic $1f, 2f, 3f$ of the
   modulation frequency falls within a few linewidths of any HOM peak up to
   order $q = 5$.  If a collision exists, adjust ROC or $f_\\mathrm{mod}$.

5. **Iterate.**  The optimizer below runs this loop automatically: each accepted
   move corresponds to one of the steps above, and the log tells you which
   objective improved.  Use the weight sliders in the widget above to tell the
   algorithm which objectives matter most for your application.\
"""

new_cell = {
    "cell_type": "markdown",
    "id": str(uuid.uuid4())[:8],
    "metadata": {},
    "source": list(heuristic_source),
}

# Insert immediately after the decision-tree cell
cells.insert(idx + 1, new_cell)
nb["cells"] = cells
pathlib.Path("notebook.ipynb").write_text(json.dumps(nb, indent=1))
print(f"Inserted heuristic cell at index {idx + 1}.")
EOF
```

- [ ] **Step 2: Verify insertion**

```bash
cd /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial
python -c "
import json, pathlib
nb = json.loads(pathlib.Path('notebook.ipynb').read_text())
cells = nb['cells']
idx = next(i for i, c in enumerate(cells) if c.get('id') == '566d6b66')
nxt = cells[idx + 1]
src = ''.join(nxt['source'])
assert 'five-step heuristic' in src
assert 'Stability first' in src
print('Verified: heuristic cell inserted correctly.')
"
```

Expected: `Verified: heuristic cell inserted correctly.`

- [ ] **Step 3: Commit**

```bash
git add notebook.ipynb
git commit -m "docs: add five-step design heuristic markdown to Section 7"
```

---

## Task 5: Add optimizer code cell to Section 7

**Files:**
- Modify: `notebook.ipynb` (insert new code cell after `cd290e77`)

- [ ] **Step 1: Insert optimizer code cell**

```bash
cd /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial
python - <<'EOF'
import json, pathlib, uuid

nb = json.loads(pathlib.Path("notebook.ipynb").read_text())
cells = nb["cells"]

# Find index of the widget code cell (cd290e77)
idx = next(i for i, c in enumerate(cells) if c.get("id") == "cd290e77")

optimizer_source = """\
# ── Greedy design optimizer ──────────────────────────────────────────────────
# Uses the current widget slider values as the starting point.
# Run the widget above first, then execute this cell.
from src.design import optimize_design, design_scores, OBJECTIVES

_start   = dict(L_mm=_L7.value, R1_mm=_R1_7.value, R2_mm=_R2_7.value,
                F=_F7.value, f_mod_mhz=_fm7.value)
_weights = {k: _WS[k].value for k, _ in OBJECTIVES}

_opt = optimize_design(**_start, weights=_weights)

print("=== Greedy optimizer log ===")
for line in _opt["history"]:
    print(line)

r = _opt["result"]
print()
print(f"{'Parameter':<14}  {'Start':>12}  {'Optimized':>12}")
print(f"{'-'*42}")
print(f"{'L (mm)':<14}  {_start['L_mm']:>12.1f}  {r['L_mm']:>12.1f}")
print(f"{'R1 (mm)':<14}  {_start['R1_mm']:>12.1f}  {r['R1_mm']:>12.1f}")
print(f"{'R2 (mm)':<14}  {_start['R2_mm']:>12.1f}  {r['R2_mm']:>12.1f}")
print(f"{'Finesse':<14}  {_start['F']:>12.0f}  {r['F']:>12.0f}")
print(f"{'f_mod (MHz)':<14}  {_start['f_mod_mhz']:>12.1f}  {r['f_mod_mhz']:>12.1f}")
print()
_s0 = design_scores(**_start)
print(f"{'Objective':<20}  {'Start':>8}  {'Optimized':>10}")
print(f"{'-'*42}")
for _k, _lbl in OBJECTIVES:
    print(f"{_lbl:<20}  {_s0[_k]:>8.3f}  {r['scores'][_k]:>10.3f}")
print(f"{'-'*42}")
print(f"{'Total':<20}  {_s0['total']:>8.3f}  {r['total']:>10.3f}")\
"""

new_cell = {
    "cell_type": "code",
    "execution_count": None,
    "id": str(uuid.uuid4())[:8],
    "metadata": {},
    "outputs": [],
    "source": list(optimizer_source),
}

cells.insert(idx + 1, new_cell)
nb["cells"] = cells
pathlib.Path("notebook.ipynb").write_text(json.dumps(nb, indent=1))
print(f"Inserted optimizer cell at index {idx + 1}.")
EOF
```

- [ ] **Step 2: Verify the cell content**

```bash
cd /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial
python -c "
import json, pathlib
nb = json.loads(pathlib.Path('notebook.ipynb').read_text())
cells = nb['cells']
idx = next(i for i, c in enumerate(cells) if c.get('id') == 'cd290e77')
nxt = cells[idx + 1]
src = ''.join(nxt['source'])
assert 'optimize_design' in src
assert 'Greedy optimizer log' in src
assert 'Total' in src
print('Verified: optimizer cell inserted correctly.')
"
```

Expected: `Verified: optimizer cell inserted correctly.`

- [ ] **Step 3: Smoke-test the optimizer imports outside the notebook**

```bash
cd /Users/rana/Desktop/Dropbox/GIT/LaboratorySkills/optical-cavity-tutorial
python - <<'EOF'
from src.design import optimize_design, design_scores, OBJECTIVES

start = dict(L_mm=100, R1_mm=500, R2_mm=500, F=1000, f_mod_mhz=50)
weights = {k: 1.0 for k, _ in OBJECTIVES}
out = optimize_design(**start, weights=weights)

print("Log:")
for line in out["history"]:
    print(" ", line)

r = out["result"]
s0 = design_scores(**start)
print(f"\nTotal: {s0['total']:.3f} → {r['total']:.3f}")
assert r["total"] >= s0["total"] - 1e-9, "Score must not decrease"
print("Smoke test passed.")
EOF
```

Expected: printed log with ↑/↓ moves, `Smoke test passed.`

- [ ] **Step 4: Commit**

```bash
git add notebook.ipynb
git commit -m "feat: add greedy optimizer code cell to Section 7"
```

---

## Task 6: Update CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Prepend session entry**

Add to the top of `CHANGELOG.md` (after the `# CHANGELOG` heading):

```markdown
## Session 3 — Notebook cleanup & greedy optimizer

- Added `optimize_design` to `src/design.py`
  - Coordinate-descent greedy over L, R1, R2, F, f_mod
  - Step sizes 10% / 5% / 2.5% over 3 cycles; early stop if no improvement
  - Returns `{history: list[str], result: dict}` for printable step log
- Added `tests/test_design_optimizer.py` (5 unit tests, all green)
- Section 1 narrative: added "Why build a cavity?" motivating paragraph (Yariv §4, Siegman §11)
- Section 3 narrative: expanded stability-boundary paragraph; added LIGO arm cavity context
  and physical motivation for third-quadrant operating point (LIGO-T010075, T0900043)
- Section 7: new "five-step heuristic" markdown cell before widget
- Section 7: new optimizer code cell after widget — prints step log and comparison table
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for session 3"
```

---

## Self-Review

**Spec coverage:**
- §1.1 Section 1 narrative → Task 2 ✓
- §1.2 Section 3 narrative → Task 3 ✓
- §2.1 `optimize_design` function → Task 1 ✓
- §2.2 Heuristic prose markdown cell → Task 4 ✓
- §2.3 Optimizer code cell → Task 5 ✓
- CHANGELOG → Task 6 ✓

**Placeholder scan:** All code blocks are complete. No TBD, no "similar to Task N", no vague "add error handling."

**Type consistency:**
- `optimize_design` returns `{'history': list[str], 'result': dict}` — used correctly in Task 5 notebook cell (`_opt["history"]`, `_opt["result"]`).
- `design_scores(**_start)` in the notebook cell uses keyword args matching the function signature `design_scores(L_mm, R1_mm, R2_mm, F, f_mod_mhz, ...)` — consistent.
- `_s0['total']` and `r['total']` both come from `design_scores` return dict which includes `'total'` — consistent with `src/design.py`.
