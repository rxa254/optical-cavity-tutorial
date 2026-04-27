# Optical Cavity Design Tutorial

An interactive reference tool for designing optical cavities from first principles —
no installation required, runs entirely in the browser via JupyterLite.

**[Launch the tutorial →](https://rxa254.github.io/optical-cavity-tutorial/)**

---

## What it covers

### `cavity_designer.ipynb` — two-mirror Fabry-Pérot reference

| Section | Topic |
|---------|-------|
| 1 | Motivation: why build a cavity? Linear vs ring geometries. |
| 2 | Cavity basics: FSR, finesse, linewidth, power buildup, coupling regimes. Airy function. |
| 3 | Stability: g-parameters, stability diagram, Gouy phase, beam caustic. LIGO arm context. |
| 4 | Gaussian beam optics & ABCD formalism *(stub)* |
| 5 | RF sidebands & PDH locking: Bessel expansion, complex cavity reflectivity, 1f/2f/3f error signals. |
| 6 | Higher-order modes & accidental resonances: Gouy phase spacing, sideband–HOM collisions. |
| 7 | Multi-objective design: stability, HOM avoidance, PDH slope, buildup, footprint. Global optimizer. |

### `imc_designer.ipynb` — aLIGO Input Mode Cleaner (3-mirror triangular ring)

| Section | Topic |
|---------|-------|
| 1 | IMC purpose, ring topology, odd-bounce parity and HOM splitting, FSR = n·f_mod constraint. |
| 2 | Ring cavity eigenmode: ABCD solver, beam sizes at each mirror, waist location. |
| 3 | Cavity parameters: finesse, coupling regimes for a 3-mirror ring. |
| 4 | HOM spectrum: even-m vs odd-m HOMs, ±1f/2f/3f sidebands with Bessel amplitude weighting, accidental resonance warnings. |
| 5 | Multi-objective optimizer: differential evolution, five objective scores, Fix FSR constraint. |

## Physics highlights

- **Odd-bounce parity** — a ring with an odd number of planar reflections shifts
  every mode with horizontal index m by an extra m·π phase per round trip, splitting
  degenerate HOM groups and producing a richer HOM comb than a linear cavity.
- **Bessel amplitude weighting** — 2f and 3f sideband–HOM collisions are penalised
  proportionally to J_h(Γ)/J₁(Γ) so weak harmonics don't dominate the avoidance score.
- **Global optimizer** — `scipy.optimize.differential_evolution` with Sobol
  initialisation and L-BFGS-B polish; cannot be trapped by local optima.
- All physics implemented from scratch in NumPy/SciPy — no optical simulation packages.

## Audience

Graduate students with a working knowledge of Gaussian beams, mirrors, and interferometry.
No derivations in the notebooks — references are cited throughout.

## Local development

```bash
git clone https://github.com/rxa254/optical-cavity-tutorial.git
cd optical-cavity-tutorial
pip install -r requirements.txt
jupyter notebook cavity_designer.ipynb
```

## References

- Siegman, *Lasers* — beam optics, ABCD, stability, HG modes
- Yariv, *Optical Electronics in Modern Communications* — cavity basics, coupling
- E. D. Black, "An introduction to Pound-Drever-Hall laser frequency stabilization,"
  *Am. J. Phys.* **69**, 79 (2001)
- LIGO Technical Documents (T-series): T970051, T010075, T0900043
