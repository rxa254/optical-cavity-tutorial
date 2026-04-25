# Optical Cavity Design Tutorial

An interactive reference tool for designing optical cavities from first principles — no installation required.

**[Launch the tutorial →](https://rxa254.github.io/optical-cavity-tutorial/)**

---

## What it covers

- Cavity basics: finesse, FSR, linewidth, power buildup, coupling
- Stability: g-parameters, stability diagrams, beam caustic
- RF sidebands and PDH locking
- Higher-order modes and accidental resonances
- Multi-objective cavity design with a greedy optimizer

Scales from tabletop (cm) to LIGO-scale (km). Running examples include a 2-mirror Fabry-Perot reference cavity and the aLIGO Input/Output Mode Cleaners.

## Audience

Graduate students with basic optics background (Gaussian beams, lenses, mirrors, interferometry).

## Local development

```bash
git clone https://github.com/rxa254/optical-cavity-tutorial.git
cd optical-cavity-tutorial
pip install -r requirements.txt
jupyter notebook cavity_designer.ipynb
```

## References

- Siegman, *Lasers*
- Yariv, *Optical Electronics*
- E. D. Black, "An introduction to Pound-Drever-Hall laser frequency stabilization," *Am. J. Phys.* 69, 79 (2001)
- LIGO Technical Documents (T-series)
