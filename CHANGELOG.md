# CHANGELOG

## Session 7 — Documentation overhaul

- Rewrote all markdown cells in both notebooks for clarity and pedagogy
  - `cavity_designer.ipynb`: expanded motivation (Sect 1), coupling-regime intuition
    (Sect 2), Gouy phase → HOM spacing connection (Sect 3), PDH physical insight
    (Sect 5), linear vs ring HOM degeneracy (Sect 6), updated optimizer description (Sect 7)
  - `imc_designer.ipynb`: corrected seed parameters (d₃₁ = 0.744 m, FSR = 9.1 MHz);
    added odd-bounce parity explanation (Sect 1); added Bessel amplitude table and
    plot-reading guide (Sect 4); updated optimizer description to DE (Sect 5)
- Updated README with per-section topic tables and physics highlights
- Fixed stale reference to "greedy optimizer" throughout

## Session 6 — IMC HOM / optimizer improvements

- `src/ring.py`: replaced greedy coordinate-descent with
  `scipy.optimize.differential_evolution` (Sobol init, L-BFGS-B polish)
  — cannot get stuck in local optima; `n_cycles` slider repurposed as effort × 100 iter
- `src/ring.py`: `ring_hom_offsets` rewrote to enumerate individual (m, n) pairs
  with the odd-bounce m·π phase correction; returns `(m, n, delta_hz, label)` tuples
- `src/ring.py`: added Bessel amplitude weighting to `_rs_hom_avoidance`:
  effective separation scaled by J₁(Γ)/J_h(Γ) so 2f/3f collisions are proportionally
  penalised; `ring_design_scores` and `ring_optimize` accept `gamma=` kwarg
- `imc_designer.ipynb`: renamed modulation depth parameter β → Γ everywhere
- `imc_designer.ipynb` Sect 4: added ±2f/3f sideband traces (dotted orange,
  height ∝ J_h/J₁); warning threshold Bessel-weighted; even-m HOMs green,
  odd-m HOMs orchid
- `imc_designer.ipynb` Sect 4: sideband lines now drawn at aliased positions
  within ±2 FSR window (raw h·f_mod is outside the window for aLIGO parameters)
- `imc_designer.ipynb` Sect 5: added Fix FSR checkbox (holds L fixed during
  optimization); added Γ slider; Effort slider (was Cycles) controls maxiter
- Default f_mod = 9.1 MHz, d₃₁ = 0.744 m (giving FSR = f_mod, n = 1 IFO constraint)

## Session 5 — aLIGO IMC designer notebook

- Created `imc_designer.ipynb` with five sections (ring cavity design reference)
- Created `src/ring.py`:
  - `ring_fsr`, `ring_3m_abcd`, `ring_3m_mode`, `ring_3m_finesse`
  - `ring_hom_offsets`: HOM offsets with tangential/sagittal Gouy phase splitting
  - `RING_OBJECTIVES`, `ring_design_scores`, `ring_optimize` (initial greedy version)
- Sections 1–5 of `imc_designer.ipynb`:
  - Sect 1: geometry, stability, seed parameters
  - Sect 2: eigenmode widget (beam sizes at M1, M2, M3; waist; stability flag)
  - Sect 3: finesse, linewidth, coupling regime widget
  - Sect 4: HOM spectrum widget (TEM00 + HOM comb + sideband lines)
  - Sect 5: radar + bar chart optimizer widget

## Session 4b — IndexedDB cache busting

- `.github/workflows/deploy.yml`: inject versioned `contentsStorageName` (git SHA)
  into `jupyter-lite.json` at build time so each deploy forces a fresh browser fetch
  rather than serving stale notebook content from IndexedDB

## Session 4 — JupyterLite GitHub Pages deployment

- Replaced `%matplotlib widget` (ipympl) with `plotly>=5.0` (FigureWidget) throughout
  - Section 2: Airy function → `go.Scatter`
  - Section 3: stability diagram + beam caustic → `go.Contour` + `go.Scatter`
  - Section 5: 4-panel PDH widget → `make_subplots(2,2)`, 9 traces
  - Section 6: HOM transfer function → `go.Scatter` fill + NaN-separated sideband lines
  - Section 7: radar + bar → `go.Scatterpolar` + `go.Bar`
- All code cells collapsed by default (`source_hidden: true`)
- Added `jupyterlite_config.json` and `.github/workflows/deploy.yml`
- `requirements.txt`: removed `ipympl>=0.9`, added `plotly>=5.0`
- Fixed JupyterLite incompatibility: layout updates (axis type, range) must be called
  via `fig.update_layout()` outside `batch_update()` — silent no-ops inside

## Session 3 — Notebook cleanup & greedy optimizer

- Added `optimize_design` to `src/design.py` (coordinate-descent, later replaced)
- Added `tests/test_design_optimizer.py` (5 unit tests)
- Section 1: added "Why build a cavity?" motivating paragraph
- Section 3: expanded stability-boundary paragraph; LIGO arm context
- Section 7: five-step heuristic markdown + optimizer code cell

## Session 2 — Chunks 3–5: sidebands, HOMs, design scorer

- `src/sidebands.py`: Bessel expansion, complex r_cav, PDH demodulation at 1f/2f/3f
- `src/hom.py`: HOM offsets, TEM00 and HOM spectra
- `src/design.py`: five-objective scorer (stability, HOM avoidance, PDH, buildup, footprint)
- Sections 5, 6, 7 added to `notebook.ipynb`

## Session 1 — Chunks 1–2: cavity.py, beams.py, stability.py, Sections 1–3

- `src/cavity.py`: finesse, FSR, linewidth, buildup, Airy functions
- `src/beams.py`: complex q-parameter, ABCD propagation, beam caustic
- `src/stability.py`: g-parameters, stability condition, Gouy phase, eigenmode
- Sections 1, 2, 3 added to `notebook.ipynb`

## Session 0 — Project initialization

- Repository structure, CLAUDE.md, PLANNING.md, README.md, requirements.txt, src/ stubs
