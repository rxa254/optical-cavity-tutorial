"""Higher-order mode resonance frequencies for a 2-mirror linear cavity."""
import numpy as np


def hom_offsets(max_mn, fsr_hz, g1, g2):
    """
    Frequency offsets of HOM groups from the nearest TEM00 resonance.

    In a 2-mirror linear cavity all HG modes with the same order q = m+n
    are degenerate and resonate at:
        Δf_q = (q · ψ / π) mod FSR
    where ψ = arccos(√(g1·g2)) is the round-trip Gouy phase (radians).

    Parameters
    ----------
    max_mn : int   — highest mode order to include
    fsr_hz : float — free spectral range in Hz
    g1, g2 : float — cavity g-parameters

    Returns
    -------
    list of (q, delta_hz, label):
      q        — mode order (m+n)
      delta_hz — offset from nearest carrier in Hz, in [0, FSR)
      label    — e.g. '(0,1)+(1,0)' for q=1
    Modes degenerate with a carrier (Δf ≈ 0 or FSR) are omitted.
    Empty list is returned for unstable or boundary cavities.
    """
    prod = g1 * g2
    if not (0.0 < prod < 1.0):
        return []

    psi = np.arccos(np.sqrt(prod))   # round-trip Gouy phase, radians

    groups = []
    seen = set()
    for q in range(1, max_mn + 1):
        df  = (q * psi / np.pi * fsr_hz) % fsr_hz
        key = round(df / fsr_hz, 5)   # normalised position for dedup
        if key < 1e-4 or key > 1.0 - 1e-4:
            continue   # degenerate with carrier — skip
        if key in seen:
            continue   # already included at this frequency
        seen.add(key)
        pairs = [f'({m},{q - m})' for m in range(q + 1)]
        groups.append((q, df, '+'.join(pairs)))

    return groups


def tem00_spectrum(freq_arr, fsr_hz, F, n_extra=2):
    """
    TEM00 Lorentzian spectrum, normalised to peak = 1.
    Builds resonances at k·FSR for k covering the full freq_arr range.
    """
    lw    = fsr_hz / F
    hw_sq = (lw / 2.0) ** 2
    spec  = np.zeros(len(freq_arr), dtype=float)
    f_min, f_max = freq_arr[0], freq_arr[-1]
    k_lo = int(np.floor(f_min / fsr_hz)) - n_extra
    k_hi = int(np.ceil(f_max  / fsr_hz)) + n_extra
    for k in range(k_lo, k_hi + 1):
        spec += hw_sq / ((freq_arr - k * fsr_hz) ** 2 + hw_sq)
    return spec


def hom_spectrum(freq_arr, fsr_hz, F, g1, g2, max_mn, n_extra=2):
    """
    HOM Lorentzian spectrum, each peak normalised to 1.

    Returns
    -------
    spec  : ndarray, same shape as freq_arr
    peaks : list of (f0_hz, q, label) for all peaks computed (not filtered by range)
    """
    offsets = hom_offsets(max_mn, fsr_hz, g1, g2)
    lw    = fsr_hz / F
    hw_sq = (lw / 2.0) ** 2
    spec  = np.zeros(len(freq_arr), dtype=float)
    peaks = []

    f_min, f_max = freq_arr[0], freq_arr[-1]
    k_lo = int(np.floor(f_min / fsr_hz)) - n_extra
    k_hi = int(np.ceil(f_max  / fsr_hz)) + n_extra

    for (q, df, label) in offsets:
        for k in range(k_lo, k_hi + 1):
            f0 = k * fsr_hz + df
            spec += hw_sq / ((freq_arr - f0) ** 2 + hw_sq)
            peaks.append((f0, q, label))

    return spec, peaks
