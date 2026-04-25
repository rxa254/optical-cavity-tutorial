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


def ring_hom_offsets(max_mn, fsr_hz, Rc, L, tol=1e-4):
    """
    HOM frequency offsets from the carrier for a 3-mirror ring cavity.

    Uses Gouy phase ψ = arccos(1 − L/Rc) (valid for 2 flat + 1 curved).
    HOM groups resonate at: Δf_q = (q · ψ / π) mod FSR.

    Parameters
    ----------
    max_mn : int   — highest mode order q = m+n to include
    fsr_hz : float — ring FSR in Hz
    Rc     : float — ROC of the curved mirror (m)
    L      : float — round-trip length (m)

    Returns
    -------
    Same format as hom.hom_offsets:
    list of (q, delta_hz, label)
    """
    tr_half = 1.0 - L / Rc
    if not (-1.0 < tr_half < 1.0):
        return []

    psi = np.arccos(tr_half)   # round-trip Gouy phase, radians

    groups = []
    seen = set()
    for q in range(1, max_mn + 1):
        df  = (q * psi / np.pi * fsr_hz) % fsr_hz
        key = round(df / fsr_hz, 5)
        if key < tol or key > 1.0 - tol:
            continue
        if key in seen:
            continue
        seen.add(key)
        pairs = [f'({m},{q - m})' for m in range(q + 1)]
        groups.append((q, df, '+'.join(pairs)))

    return groups
