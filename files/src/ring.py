"""3-mirror triangular ring cavity: ABCD, eigenmode, and HOM resonances."""
import numpy as np
from scipy.constants import c as _C
from scipy.special import jv as _jv
from .beams import q_beam_radius, abcd_propagate, beam_caustic  # noqa: F401 (re-exported)


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
    'f_mod_mhz': (1.0,   80.0),   # IMC locking frequency — independent of f_IFO
}

# IFO modulation frequency that the IMC must transmit.
# The IMC FSR must satisfy FSR = f_IFO / n for a positive integer n, so that
# f_IFO sidebands are resonant in the IMC and transmitted to the main IFO.
F_IFO_MHZ_DEFAULT = 9.1
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


def _rs_hom_avoidance(d12, d31, Rc, F, f_mod_hz, max_mn=8, gamma=0.3):
    L      = 2 * d12 + d31
    fsr_hz = ring_fsr(L)
    lw_hz  = fsr_hz / F
    offsets = ring_hom_offsets(max_mn, fsr_hz, Rc, L)
    if not offsets:
        return 0.0
    target = 10.0 * lw_hz
    j1 = max(abs(float(_jv(1, gamma))), 1e-10)   # ±1f amplitude (normalisation reference)
    min_eff_sep = np.inf
    for (m, n, df, _) in offsets:
        df_c = df if df < fsr_hz / 2 else df - fsr_hz
        for h in [1, 2, 3]:
            # Scale effective separation by relative Bessel amplitude J_h / J_1.
            # A 2f collision at separation s matters as much as a 1f collision at
            # s * (J_2/J_1) — i.e., weak harmonics need to be much closer to count.
            j_h = max(abs(float(_jv(h, gamma))), 1e-10)
            for sign in [+1, -1]:
                fsb   = (sign * h * f_mod_hz) % fsr_hz
                fsb_c = fsb if fsb < fsr_hz / 2 else fsb - fsr_hz
                sep   = abs(fsb_c - df_c)
                min_eff_sep = min(min_eff_sep, sep * j1 / j_h)
    return float(np.clip(min_eff_sep / target, 0.0, 1.0))


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
                       weights=None, max_mn=8, gamma=0.3):
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
    gamma     : float — phase modulation depth Γ (used to weight sideband harmonics
                        by their Bessel amplitude J_h(Γ) when scoring HOM avoidance)

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
        'hom_avoidance': _rs_hom_avoidance(d12_m, d31_m, Rc_m, F, f_mod, max_mn, gamma),
        'pdh_slope':     _rs_pdh_slope(d12_m, d31_m, F, f_mod),
        'finesse':       _rs_finesse(F),
        'beam_waist':    _rs_beam_waist(d12_m, d31_m, Rc_m),
    }
    w_sum = sum(weights.get(k, 1.0) for k in raw) or 1.0
    raw['total'] = float(sum(weights.get(k, 1.0) * v for k, v in raw.items()) / w_sum)
    return raw


def ring_optimize(d12_m, d31_m, Rc_m, R, f_mod_mhz,
                  weights=None, n_cycles=3, fix_fsr=False, gamma=0.3,
                  f_IFO_mhz=F_IFO_MHZ_DEFAULT, n_fsr=1):
    """
    Global optimizer for the 3-mirror ring cavity using differential evolution.

    Parameters
    ----------
    n_cycles  : int  — effort multiplier; maxiter = n_cycles × 100 DE iterations.
    fix_fsr   : bool — hold L fixed so that FSR = f_IFO_mhz / n_fsr, which
                       ensures the IFO sidebands (at f_IFO_mhz) are resonant
                       in the IMC and therefore transmitted. When True, only
                       d12 (and derived d31), Rc, R, and f_mod are optimized.
    gamma     : float — phase modulation depth Γ; weights sideband harmonics
                        by J_h(Γ) in the HOM-avoidance score.
    f_IFO_mhz : float — IFO modulation frequency (MHz) that must be transmitted
                        by the IMC (default 9.1 MHz). Sets the FSR when
                        fix_fsr=True via L = n_fsr * c / f_IFO.
    n_fsr     : int   — FSR harmonic: FSR = f_IFO_mhz / n_fsr. n_fsr=1 gives
                        FSR = f_IFO ≈ 9.1 MHz (L ≈ 33 m, LIGO-scale); larger
                        n_fsr gives shorter cavities at the cost of more IFO
                        sidebands inside the IMC bandwidth.

    Returns {'history': list[str], 'result': dict}.
    result keys: d12_m, d31_m, Rc_m, R, f_mod_mhz, scores (dict), total (float).
    """
    from scipy.optimize import differential_evolution

    if weights is None:
        weights = {k: 1.0 for k, _ in RING_OBJECTIVES}

    # Cavity length that makes FSR = f_IFO / n_fsr (IFO sidebands resonant → transmitted)
    L_IFO = n_fsr * _C / (f_IFO_mhz * 1e6)
    # For free optimization, start from the caller's geometry
    L_free = 2 * d12_m + d31_m

    if fix_fsr:
        L_fixed = L_IFO
        lo_d12 = 2.0
        hi_d12 = max(2.01, (L_fixed - 0.1) / 2.0)
        bounds = [
            (lo_d12,              hi_d12),
            _RING_BOUNDS['Rc_m'],
            _RING_BOUNDS['R'],
            _RING_BOUNDS['f_mod_mhz'],
        ]

        def _neg_total(x):
            d12, Rc, R_, fm = x
            d31 = L_fixed - 2.0 * d12
            return -ring_design_scores(d12, d31, Rc, R_, fm,
                                       weights=weights, gamma=gamma)['total']

        x0 = [min(max((L_fixed - 0.1) / 2.0, lo_d12), hi_d12), Rc_m, R, f_mod_mhz]

    else:
        L_fixed = L_free
        bounds = [_RING_BOUNDS[k]
                  for k in ('d12_m', 'd31_m', 'Rc_m', 'R', 'f_mod_mhz')]

        def _neg_total(x):
            d12, d31, Rc, R_, fm = x
            return -ring_design_scores(d12, d31, Rc, R_, fm,
                                       weights=weights, gamma=gamma)['total']

        x0 = [d12_m, d31_m, Rc_m, R, f_mod_mhz]

    history = []
    state = {'iter': 0, 'best': 1.0}   # best = neg score (minimising)

    def _callback(xk, convergence):
        state['iter'] += 1
        score = -_neg_total(xk)
        # Log whenever score improves noticeably or every 25 iterations
        if score > -state['best'] + 5e-4 or state['iter'] % 25 == 0:
            state['best'] = -score
            history.append(f"iter {state['iter']:3d}:  total = {score:.4f}")
        return False   # never stop early via callback

    res = differential_evolution(
        _neg_total,
        bounds,
        maxiter=n_cycles * 100,
        seed=42,
        tol=1e-5,
        init='sobol',   # better initial population than random
        polish=True,    # L-BFGS-B polish of the best candidate at the end
        callback=_callback,
        workers=1,
    )

    tag = '✓ converged' if res.success else '⚠ not converged'
    history.append(f'{tag}  after {state["iter"]} iter  —  total = {-res.fun:.4f}')

    if fix_fsr:
        d12_opt, Rc_opt, R_opt, fm_opt = res.x
        d31_opt = L_fixed - 2.0 * d12_opt
    else:
        d12_opt, d31_opt, Rc_opt, R_opt, fm_opt = res.x

    full  = dict(d12_m=d12_opt, d31_m=d31_opt, Rc_m=Rc_opt,
                 R=R_opt, f_mod_mhz=fm_opt)
    final = ring_design_scores(full['d12_m'], full['d31_m'], full['Rc_m'],
                                full['R'], full['f_mod_mhz'],
                                weights=weights, gamma=gamma)
    return {'history': history,
            'result':  {**full, 'scores': final, 'total': final['total']}}
