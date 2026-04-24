"""Multi-objective design scores for a 2-mirror optical cavity."""
import numpy as np

from src.stability import g_params
from src.cavity import fsr as _compute_fsr, power_buildup
from src.sidebands import R_from_finesse
from src.hom import hom_offsets

_C = 299_792_458.0


def score_stability(L_m, R1_m, R2_m):
    """
    Stability margin score in [0, 1].
    Peaks at 1.0 when g1·g2 = 0.5 (centre of stable region); 0 outside.
    """
    g1, g2 = g_params(L_m, R1_m, R2_m)
    prod = g1 * g2
    if prod < 0 or prod > 1:
        return 0.0
    return float(np.clip(2.0 * min(prod, 1.0 - prod), 0.0, 1.0))


def score_hom_avoidance(L_m, R1_m, R2_m, F, f_mod_hz, max_mn=8):
    """
    HOM avoidance score in [0, 1].
    Minimum separation between any ±1f/2f/3f sideband and any HOM peak,
    normalised to 10 linewidths. Score = 1 when all separations > 10 lw.
    Returns 0 for unstable or confocal cavities (no HOM structure).
    """
    g1, g2 = g_params(L_m, R1_m, R2_m)
    fsr_hz = _compute_fsr(L_m)
    lw_hz  = fsr_hz / F

    offsets = hom_offsets(max_mn, fsr_hz, g1, g2)
    if not offsets:
        return 0.0

    target = 10.0 * lw_hz
    min_sep = np.inf

    hom_freqs = [ck * fsr_hz + df for (_, df, _) in offsets for ck in [0, 1]]

    for ck in [0, 1]:
        fc = ck * fsr_hz
        for h in [1, 2, 3]:
            for sign in [+1, -1]:
                fsb = fc + sign * h * f_mod_hz
                for fh in hom_freqs:
                    sep = abs(fsb - fh)
                    if sep < min_sep:
                        min_sep = sep

    return float(np.clip(min_sep / target, 0.0, 1.0))


def score_pdh_slope(L_m, F, f_mod_hz):
    """
    PDH sideband placement score in [0, 1].
    The key requirement is f_mod >> linewidth (sidebands off resonance).
    Score = 1 when f_mod ≥ 10 × linewidth; falls to 0 at f_mod = linewidth.
    """
    fsr_hz = _compute_fsr(L_m)
    lw_hz  = fsr_hz / F
    return float(np.clip(f_mod_hz / (10.0 * lw_hz), 0.0, 1.0))


def score_power_buildup(R1, R2, B_ref=1e4):
    """
    Power buildup score in [0, 1].
    Logarithmically normalised: 1 at B ≥ B_ref (default 10 000×).
    """
    B = power_buildup(R1, R2)
    return float(np.clip(np.log10(max(B, 1.0)) / np.log10(B_ref), 0.0, 1.0))


def score_footprint(L_mm, L_target_mm=100.0, L_max_mm=500.0):
    """
    Footprint score in [0, 1].
    1.0 for L ≤ L_target, linearly decreasing to 0 at L_max.
    """
    if L_mm <= L_target_mm:
        return 1.0
    return float(np.clip(1.0 - (L_mm - L_target_mm) / (L_max_mm - L_target_mm),
                         0.0, 1.0))


# Ordered list of (key, display label) — preserves radar chart axis order
OBJECTIVES = [
    ('stability',     'Stability'),
    ('hom_avoidance', 'HOM avoid.'),
    ('pdh_slope',     'PDH slope'),
    ('power_buildup', 'Buildup'),
    ('footprint',     'Footprint'),
]


def design_scores(L_mm, R1_mm, R2_mm, F, f_mod_mhz, beta=0.3,
                  weights=None, max_mn=8):
    """
    Compute all objective scores and a weighted total.

    Returns dict with one float per OBJECTIVES key, plus 'total'.
    """
    if weights is None:
        weights = {k: 1.0 for k, _ in OBJECTIVES}

    L_m  = L_mm  * 1e-3
    R1_m = R1_mm * 1e-3
    R2_m = R2_mm * 1e-3
    fmod = f_mod_mhz * 1e6
    R    = R_from_finesse(F)

    raw = {
        'stability':     score_stability(L_m, R1_m, R2_m),
        'hom_avoidance': score_hom_avoidance(L_m, R1_m, R2_m, F, fmod, max_mn),
        'pdh_slope':     score_pdh_slope(L_m, F, fmod),
        'power_buildup': score_power_buildup(R, R),
        'footprint':     score_footprint(L_mm),
    }

    w_sum = sum(weights.get(k, 1.0) for k in raw)
    total = sum(weights.get(k, 1.0) * v for k, v in raw.items()) / w_sum

    raw['total'] = float(total)
    return raw


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
