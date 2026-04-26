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
