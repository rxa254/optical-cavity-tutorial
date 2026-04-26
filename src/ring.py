"""3-mirror triangular ring cavity: ABCD, eigenmode, and HOM resonances."""
import numpy as np
from .beams import q_beam_radius, abcd_propagate, beam_caustic  # noqa: F401 (re-exported)

_C = 299_792_458.0


def ring_fsr(L):
    """Free spectral range for a ring cavity: c / L  (Hz, L in metres)."""
    return _C / L


def ring_3m_abcd(d12, d23, d31, Rc):
    """
    Round-trip ABCD matrix for a 3-mirror triangular ring cavity with
    flat mirrors M1 and M3 and curved mirror M2 (ROC = Rc).

    Propagation order: M1 → d12 → M2 → d23 → M3 → d31 → M1.
    Flat mirrors contribute identity; curved mirror contributes [[1,0],[-2/Rc,1]].

    Because M1 and M3 are flat (identity), the matrix reduces to:
        M_rt = M_prop(d31 + d23) @ M_curved(Rc) @ M_prop(d12)

    All lengths in metres. Evaluated at M1. Returns 2×2 numpy array.
    """
    prop = lambda d: np.array([[1.0, d], [0.0, 1.0]])
    M_curved = np.array([[1.0, 0.0], [-2.0 / Rc, 1.0]])
    return prop(d31 + d23) @ M_curved @ prop(d12)


def ring_3m_mode(d12, d23, d31, Rc, wavelength=1064e-9):
    """
    Self-consistent Gaussian eigenmode for a 3-mirror triangular ring cavity.

    Solves C·q² + (D−A)·q − B = 0 from the round-trip ABCD matrix.
    Cavity is stable when |Tr(M)/2| ≤ 1.

    For 2 flat + 1 curved: Tr(M) = 2(1 − L/Rc), so the stability condition
    simplifies to Rc > L/2.

    Round-trip Gouy phase: ψ = arccos(Tr(M)/2) = arccos(1 − L/Rc).

    Parameters
    ----------
    d12, d23, d31 : float  — leg lengths in metres (M1→M2, M2→M3, M3→M1)
    Rc            : float  — ROC of MC2 in metres (positive = concave)
    wavelength    : float  — metres (default 1064 nm)

    Returns
    -------
    dict with keys:
      stable       – bool
      Tr           – trace of round-trip M
      L            – round-trip length (m)
      gouy_deg     – round-trip Gouy phase in degrees (nan if unstable)
      q1           – complex q at M1 (None if unstable)
      q_at_M2      – complex q just before M2
      q_at_M3      – complex q just before M3
      q_after_M2   – complex q just after M2 (after curved mirror)
      w1, w2, w3   – beam radii at M1, M2, M3 (m)
      w0           – waist radius (m)
      z_R          – Rayleigh range (m)
      d_waist      – signed distance from M1 to waist along M1→M2 (m);
                     negative means waist is in the M3→M1 leg
    """
    L = d12 + d23 + d31
    M = ring_3m_abcd(d12, d23, d31, Rc)
    A, B, C, D = M[0, 0], M[0, 1], M[1, 0], M[1, 1]
    Tr = A + D

    result = dict(
        stable=False, Tr=Tr, L=L, gouy_deg=float('nan'),
        q1=None, q_at_M2=None, q_at_M3=None, q_after_M2=None,
        w1=None, w2=None, w3=None, w0=None, z_R=None, d_waist=None,
    )

    disc = Tr ** 2 - 4.0
    if disc >= 0.0 or abs(C) < 1e-15:
        return result

    result['stable'] = True
    result['gouy_deg'] = float(np.degrees(np.arccos(np.clip(Tr / 2, -1, 1))))

    im_q = np.sqrt(-disc) / (2.0 * abs(C))
    re_q = (A - D) / (2.0 * C)
    q1 = complex(re_q, im_q)

    prop = lambda d: np.array([[1.0, d], [0.0, 1.0]])
    M_curved = np.array([[1.0, 0.0], [-2.0 / Rc, 1.0]])

    q_at_M2   = abcd_propagate(q1,       prop(d12))
    q_after_M2 = abcd_propagate(q_at_M2, M_curved)
    q_at_M3   = abcd_propagate(q_after_M2, prop(d23))

    result.update(
        q1=q1,
        q_at_M2=q_at_M2,
        q_at_M3=q_at_M3,
        q_after_M2=q_after_M2,
        w1=float(q_beam_radius(q1,       wavelength)),
        w2=float(q_beam_radius(q_at_M2,  wavelength)),
        w3=float(q_beam_radius(q_at_M3,  wavelength)),
        w0=float(np.sqrt(wavelength * im_q / np.pi)),
        z_R=float(im_q),
        d_waist=float(-re_q),
    )
    return result


def ring_3m_finesse(R1, R2, R3=None):
    """
    Cavity finesse for a 3-mirror ring cavity.

    R1, R2, R3: power reflectivities of the three mirrors.
    If R3 is None, assumes R3 = R1 (symmetric coupling mirrors).

    F = π · √r / (1 − r),  r = √(R1·R2·R3)  [Siegman §11]
    """
    if R3 is None:
        R3 = R1
    r = np.sqrt(R1 * R2 * R3)
    return np.pi * np.sqrt(r) / (1.0 - r)


def ring_hom_offsets(max_mn, fsr_hz, Rc, L, theta_deg=0.0, tol=1e-4):
    """
    HOM frequency offsets from the carrier for a 3-mirror triangular ring cavity
    (2 flat mirrors + 1 curved mirror).

    Accounts for the odd-bounce parity flip: 3 planar reflections (odd count)
    give a net x → −x flip each round trip, which adds a phase of m·π to
    horizontal mode index m.  The resonance condition is:

        Δf_{mn} = (m·ψ_t + n·ψ_s + m·π) / (2π) · FSR   mod   FSR

    where ψ_t and ψ_s are the round-trip tangential and sagittal Gouy phases.
    For small angle of incidence (e.g. IMC θ ≈ 1°) ψ_t ≈ ψ_s to <0.1%.

    Parameters
    ----------
    max_mn    : int   — highest mode order m+n to include
    fsr_hz    : float — ring FSR in Hz
    Rc        : float — ROC of the curved mirror (m)
    L         : float — round-trip length (m)
    theta_deg : float — angle of incidence at curved mirror in degrees (default 0)
    tol       : float — fractional FSR window treated as "at resonance" (default 1e-4)

    Returns
    -------
    list of (m, n, delta_hz, label)
        m, n      — HG mode indices (m horizontal, n vertical)
        delta_hz  — frequency offset from carrier in [0, FSR)
        label     — e.g. '(1,2)'
    """
    theta = np.radians(theta_deg)
    cos_t = np.cos(theta)

    # Effective ROC in tangential (in-plane) and sagittal (out-of-plane) planes
    Rc_t = Rc * cos_t
    Rc_s = Rc / cos_t

    for Rc_eff in (Rc_t, Rc_s):
        if not (-1.0 < 1.0 - L / Rc_eff < 1.0):
            return []

    psi_t = np.arccos(1.0 - L / Rc_t)   # tangential round-trip Gouy phase (rad)
    psi_s = np.arccos(1.0 - L / Rc_s)   # sagittal round-trip Gouy phase (rad)

    modes = []
    for q in range(1, max_mn + 1):
        for m in range(q + 1):
            n = q - m
            # Odd-bounce parity: 3 reflections add m·π to horizontal phase
            phase = m * psi_t + n * psi_s + m * np.pi
            df    = (phase / (2.0 * np.pi) * fsr_hz) % fsr_hz
            frac  = df / fsr_hz
            if frac < tol or frac > 1.0 - tol:
                continue
            modes.append((m, n, df, f'({m},{n})'))

    return modes


# ── multi-objective design scoring for 3-mirror ring cavity ──────────────────

RING_OBJECTIVES = [
    ('stability',     'Stability'),
    ('hom_avoidance', 'HOM avoid.'),
    ('pdh_slope',     'PDH slope'),
    ('finesse',       'Finesse'),
    ('beam_waist',    'Beam waist'),
]

_RING_BOUNDS = {
    'd12_m':     (2.0,   25.0),
    'd31_m':     (0.1,   3.0),
    'Rc_m':      (15.0,  100.0),
    'R':         (0.90,  0.9999),
    'f_mod_mhz': (1.0,   80.0),
}
_RING_NAMES = {'d12_m': 'd₁₂', 'd31_m': 'd₃₁', 'Rc_m': 'Rc',
               'R': 'R', 'f_mod_mhz': 'f_mod'}
_RING_UNITS = {'d12_m': 'm', 'd31_m': 'm', 'Rc_m': 'm',
               'R': '', 'f_mod_mhz': 'MHz'}
_RING_FMT   = {'d12_m': '.1f', 'd31_m': '.2f', 'Rc_m': '.2f',
               'R': '.4f', 'f_mod_mhz': '.1f'}

_HR_R2 = 0.99999   # fixed HR mirror reflectivity for finesse calculation


def _rs_stability(Rc, L):
    tr = 1.0 - L / Rc
    if abs(tr) >= 1.0:
        return 0.0
    return float(1.0 - abs(tr))


def _rs_hom_avoidance(d12, d31, Rc, F, f_mod_hz, max_mn=8):
    L      = 2 * d12 + d31
    fsr_hz = ring_fsr(L)
    lw_hz  = fsr_hz / F
    offsets = ring_hom_offsets(max_mn, fsr_hz, Rc, L)
    if not offsets:
        return 0.0
    target  = 10.0 * lw_hz
    min_sep = np.inf
    for (m, n, df, _) in offsets:
        df_c = df if df < fsr_hz / 2 else df - fsr_hz
        for sign in [+1, -1]:
            fsb   = (sign * f_mod_hz) % fsr_hz
            fsb_c = fsb if fsb < fsr_hz / 2 else fsb - fsr_hz
            min_sep = min(min_sep, abs(fsb_c - df_c))
    return float(np.clip(min_sep / target, 0.0, 1.0))


def _rs_pdh_slope(d12, d31, F, f_mod_hz):
    L     = 2 * d12 + d31
    fsr   = ring_fsr(L)
    lw    = fsr / F
    return float(np.clip(f_mod_hz / (10.0 * lw), 0.0, 1.0))


def _rs_finesse(F, F_target=2000.0):
    return float(np.clip(np.log10(max(F, 1.0)) / np.log10(F_target), 0.0, 1.0))


def _rs_beam_waist(d12, d31, Rc, wavelength=1064e-9,
                   w0_min=0.5e-3, w0_max=8.0e-3):
    res = ring_3m_mode(d12, d12, d31, Rc, wavelength)
    if not res['stable'] or res['w0'] is None:
        return 0.0
    w0 = res['w0']
    if w0 < w0_min or w0 > w0_max:
        return 0.0
    w0_mid     = np.sqrt(w0_min * w0_max)
    half_range = np.log(w0_max / w0_min) / 2.0
    return float(np.clip(1.0 - abs(np.log(w0 / w0_mid)) / half_range, 0.0, 1.0))


def ring_design_scores(d12_m, d31_m, Rc_m, R, f_mod_mhz,
                       weights=None, max_mn=8):
    """
    Multi-objective design scores for a 3-mirror triangular ring cavity.

    Parameters
    ----------
    d12_m     : float — d12 = d23 leg length in metres
    d31_m     : float — short leg d31 in metres
    Rc_m      : float — curved mirror ROC in metres
    R         : float — power reflectivity of coupling mirrors (R1 = R3)
    f_mod_mhz : float — modulation frequency in MHz
    weights   : dict  — per-objective weight (default all 1.0)
    max_mn    : int   — HOM order cutoff

    Returns
    -------
    dict with one float per RING_OBJECTIVES key plus 'total'.
    """
    if weights is None:
        weights = {k: 1.0 for k, _ in RING_OBJECTIVES}
    F      = ring_3m_finesse(R, _HR_R2)
    f_mod  = f_mod_mhz * 1e6
    raw = {
        'stability':     _rs_stability(Rc_m, 2 * d12_m + d31_m),
        'hom_avoidance': _rs_hom_avoidance(d12_m, d31_m, Rc_m, F, f_mod, max_mn),
        'pdh_slope':     _rs_pdh_slope(d12_m, d31_m, F, f_mod),
        'finesse':       _rs_finesse(F),
        'beam_waist':    _rs_beam_waist(d12_m, d31_m, Rc_m),
    }
    w_sum = sum(weights.get(k, 1.0) for k in raw) or 1.0
    raw['total'] = float(sum(weights.get(k, 1.0) * v for k, v in raw.items()) / w_sum)
    return raw


def ring_optimize(d12_m, d31_m, Rc_m, R, f_mod_mhz,
                  weights=None, n_cycles=3, fix_fsr=False):
    """
    Greedy coordinate-descent optimizer for the 3-mirror ring cavity.

    Parameters
    ----------
    fix_fsr : bool
        If True, L = 2·d12 + d31 is held constant (FSR fixed).  The
        optimizer varies d12 (redistributing length between the legs)
        while d31 = L - 2·d12 adjusts automatically.  d31_m is not a
        free variable.  Use this when the IFO modulation sideband
        frequencies require a specific FSR.

    Returns {'history': list[str], 'result': dict}.
    result keys: d12_m, d31_m, Rc_m, R, f_mod_mhz, scores (dict), total (float).
    """
    if weights is None:
        weights = {k: 1.0 for k, _ in RING_OBJECTIVES}

    L_fixed = 2 * d12_m + d31_m   # round-trip length (fixed when fix_fsr=True)

    if fix_fsr:
        # Free parameters: d12, Rc, R, f_mod  (d31 = L_fixed - 2·d12)
        _opt_keys = ['d12_m', 'Rc_m', 'R', 'f_mod_mhz']
        _opt_bds  = {
            'd12_m':     (2.0, max(2.01, (L_fixed - 0.1) / 2)),
            'Rc_m':      _RING_BOUNDS['Rc_m'],
            'R':         _RING_BOUNDS['R'],
            'f_mod_mhz': _RING_BOUNDS['f_mod_mhz'],
        }
        params = dict(d12_m=d12_m, Rc_m=Rc_m, R=R, f_mod_mhz=f_mod_mhz)

        def _total(p):
            d31 = L_fixed - 2 * p['d12_m']
            return ring_design_scores(
                p['d12_m'], d31, p['Rc_m'], p['R'], p['f_mod_mhz'],
                weights=weights,
            )['total']

    else:
        _opt_keys = list(_RING_BOUNDS)
        _opt_bds  = _RING_BOUNDS
        params    = dict(d12_m=d12_m, d31_m=d31_m, Rc_m=Rc_m, R=R, f_mod_mhz=f_mod_mhz)

        def _total(p):
            return ring_design_scores(
                p['d12_m'], p['d31_m'], p['Rc_m'], p['R'], p['f_mod_mhz'],
                weights=weights,
            )['total']

    history = []

    for cycle in range(n_cycles):
        step     = 0.10 / (2 ** cycle)
        improved = False
        cur      = _total(params)

        for key in _opt_keys:
            cur_val = params[key]
            lo, hi  = _opt_bds[key]
            best_val, best_total, best_dir = cur_val, cur, None

            for direction, new_val in [('+', cur_val * (1 + step)),
                                       ('-', cur_val * (1 - step))]:
                if not (lo <= new_val <= hi):
                    continue
                t = _total({**params, key: new_val})
                if t > best_total:
                    best_total, best_val, best_dir = t, new_val, direction

            if best_dir is not None:
                fmt = _RING_FMT[key]
                history.append(
                    f"{'↑' if best_dir == '+' else '↓'} {_RING_NAMES[key]}: "
                    f"{cur_val:{fmt}}{_RING_UNITS[key]} → {best_val:{fmt}}{_RING_UNITS[key]}"
                    f"  [total {cur:.3f} → {best_total:.3f}]"
                )
                params[key] = best_val
                cur         = best_total
                improved    = True

        if not improved:
            history.append(f'(cycle {cycle + 1}: no improvement — stopping early)')
            break
        else:
            history.append(f'(cycle {cycle + 1} complete, step = {step * 100:.1f}%)')

    # Reconstruct full parameter set
    if fix_fsr:
        d31_final = L_fixed - 2 * params['d12_m']
        full = dict(d12_m=params['d12_m'], d31_m=d31_final,
                    Rc_m=params['Rc_m'], R=params['R'],
                    f_mod_mhz=params['f_mod_mhz'])
    else:
        full = dict(params)

    final = ring_design_scores(
        full['d12_m'], full['d31_m'], full['Rc_m'],
        full['R'], full['f_mod_mhz'], weights=weights,
    )
    return {'history': history,
            'result':  {**full, 'scores': final, 'total': final['total']}}
