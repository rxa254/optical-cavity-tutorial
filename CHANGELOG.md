# CHANGELOG

## Session 4 — JupyterLite GitHub Pages deployment

- Replaced `%matplotlib widget` (ipympl) with `plotly>=5.0` (FigureWidget) throughout notebook
  - Section 2: 2-panel semilogy → `go.Scatter` with `yaxis_type='log'`
  - Section 3: stability contourf + beam caustic fill_between → `go.Contour` + `go.Scatter` fill
  - Section 5: 4-panel PDH widget → `make_subplots(2,2)` FigureWidget, 9 traces
  - Section 6: HOM transfer function → `go.Scatter` fill + NaN-separated sideband lines
  - Section 7: matplotlib polar + bar → `go.Scatterpolar` + `go.Bar`
- All code cells collapsed by default (`source_hidden: true`) for clean web view
- Added `jupyterlite_config.json` — declares notebook + src/ as site contents
- Added `.github/workflows/deploy.yml` — builds JupyterLite on push to main, publishes to gh-pages
- `requirements.txt`: removed `ipympl>=0.9`, added `plotly>=5.0`
- Local build tested: `jupyter lite build --output-dir _output` passes
- **User action required:** Settings → Pages → source: `gh-pages` branch, `/ (root)`

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

## Session 0 — Project initialization
- Created repository structure
- Added CLAUDE.md, PLANNING.md, README.md, requirements.txt
- Added src/ module stubs
- Notebook not yet created

## Session 1 — Chunk 1: cavity.py + Sections 1–2
- Created src/__init__.py, src/cavity.py
  - finesse(R1, R2): exact formula F = π√r/(1−r), r = √(R1·R2) [Siegman §11]
  - fsr(L, cavity_type): linear or ring
  - linewidth(F, fsr_hz)
  - power_buildup(R1, R2): on-resonance circulating/input power
  - coupling_status(R1, R2): 'critical' / 'over' / 'under'
  - circulating_spectrum(delta_nu, fsr_hz, R1, R2): exact Airy function
  - reflection_spectrum(delta_nu, fsr_hz, R1, R2): exact Airy function
- Created notebook.ipynb with Sections 1 and 2
  - Section 1: intro, conventions table, running examples table
  - Section 2: narrative with formulas, interactive widget (R1/R2/L sliders,
    Airy function plots for intracavity and reflected power, live readout of
    F / FSR / linewidth / buildup / coupling status)
- Added ipympl>=0.9 to requirements.txt (needed for %matplotlib widget)

## Session 2 — Chunk 5: design.py + Section 7

- Created src/design.py
  - score_stability(L_m, R1_m, R2_m): 0→1, peaks at g1·g2=0.5
  - score_hom_avoidance(...): min sideband–HOM separation in linewidths,
    normalised to 10 lw target
  - score_pdh_slope(L_m, F, f_mod_hz): f_mod/lw normalised to 10× target
  - score_power_buildup(R1, R2, B_ref=1e4): log-normalised buildup
  - score_footprint(L_mm): 1 at L≤100mm, 0 at L=500mm
  - OBJECTIVES list (ordered for radar chart axes)
  - design_scores(...): combines all 5 scores with user-supplied weights
- Added Section 7 to notebook.ipynb
  - Markdown: 5-objective table, conflict/trade-off analysis, starter decision tree
  - Interactive widget: preset dropdown (5 designs), parameter sliders
    (L, R1, R2, F, f_mod), weight sliders (one per objective)
  - Radar/spider chart: 5-axis polar plot of current scores
  - Bar chart: individual scores, color-coded (blue>0.7, orange>0.4, red≤0.4)
  - Info bar: g1·g2 stability status, FSR, linewidth, f_mod/lw ratio
  - Tested all presets: no NaN, physically reasonable scores

## Session 2 — Chunk 4: sidebands.py + Section 5

- Created src/sidebands.py
  - R_from_finesse(F): exact analytic inversion of F = π√R/(1−R)
  - bessel_coeffs(beta, max_order=3): J_n(β) array via scipy.special.jv
  - reflection_coeff(delta_nu, fsr_hz, R1, R2): complex r_cav(δ)
  - reflected_power(...): P = Σ_n J_n² |r_n|² (all sideband orders)
  - demod_amplitudes(...): A_k = Σ_n J_n J_{n-k} r_n r_{n-k}*;
    returns I_k = Re(A_k), Q_k = −Im(A_k) for k = 1, 2, 3
  - pdh_signal(...): Re(A_k · e^{iφ_demod})
  - sideband_input_spectrum(f_mod_hz, beta): |J_n|² bar chart data
- Added Section 5 to notebook.ipynb
  - Markdown: phase modulation → Bessel expansion → cavity reflection →
    PDH demodulation formula; key constraint f_mod ≫ linewidth explained
  - Interactive widget (4-panel, 2×2):
    - Panel A: reflected power vs detuning (steelblue)
    - Panel B: 1f PDH error signal with adjustable φ_demod (darkorange)
    - Panel C: I (solid) and Q (dashed) quadratures at 1f / 2f / 3f
    - Panel D: input field spectrum |J_n(β)|² bars (mediumpurple)
  - Controls: L (mm), Finesse (log), f_mod (MHz), β, φ_demod (°)
  - Dynamic axis units: kHz for high-finesse, MHz otherwise
  - Info bar: FSR, linewidth, f_mod/lw ratio (green if >10, orange if not)
  - All computations tested in surf conda env

## Session 2 — Chunk 3: hom.py + Section 6
- Created src/hom.py
  - hom_offsets(max_mn, fsr_hz, g1, g2): HOM frequency offsets from carrier
  - tem00_spectrum(freq_arr, fsr_hz, F): Lorentzian TEM00 spectrum
  - hom_spectrum(freq_arr, fsr_hz, F, g1, g2, max_mn): HOM Lorentzian spectrum
- Added Section 6 to notebook.ipynb
  - Markdown: Gouy phase, HOM resonance condition, color convention,
    accidental resonance explanation
  - Interactive widget: 2-FSR cavity transfer function with TEM00 (blue),
    HOM peaks labeled q=m+n (green), RF sideband lines (orange)
  - Accidental resonance detection: flags sidebands within 3 linewidths
    of any HOM peak
  - Adaptive frequency resolution (8k–40k points based on F/FSR ratio)
  - Controls: ROC (log), L, Finesse (log), max mode order, f_mod

## Session 1 — Chunk 2: beams.py + stability.py + Section 3
- Created src/beams.py
  - rayleigh_range(w0, wavelength)
  - q_beam_radius(q, wavelength): w from complex q via Im(1/q)
  - q_wavefront_radius(q): R from complex q
  - abcd_propagate(q, M): q_out = (Aq+B)/(Cq+D)
  - beam_caustic(q0, z_array, wavelength): w(z) for free-space propagation
- Created src/stability.py
  - g_params(L, R1, R2): g_i = 1 - L/R_i
  - is_stable(g1, g2): 0 ≤ g1·g2 ≤ 1
  - stability_margin(g1, g2)
  - gouy_phase_rt(g1, g2): arccos(√(g1·g2)) in degrees
  - round_trip_matrix(L, R1, R2): M_m1 @ M_prop @ M_m2 @ M_prop
  - cavity_mode(L, R1, R2, wavelength): eigenmode via Tr(M)²-4 discriminant;
    returns q1, w0, d_waist, w1, w2, z_R, g1, g2, stable
- Added Section 3 to notebook.ipynb
  - Markdown: g-parameters, stability condition, Gouy phase, special operating
    points table with practical notes
  - Interactive widget: stability diagram (g1-g2 plane, shaded stable region,
    special points annotated) + beam caustic (side view, waist annotation),
    live readout of g1, g2, g1·g2, w0, w1, w2, waist position, Gouy phase,
    stability margin; R1/R2 on log sliders (50mm–1000km), L linear slider
