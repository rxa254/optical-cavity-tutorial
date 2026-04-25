"""2-mirror cavity stability: g-parameters, round-trip ABCD, Gaussian eigenmode."""
import numpy as np
from .beams import q_beam_radius


def g_params(L, R1, R2):
    """
    g-parameters for a 2-mirror linear cavity.
    g_i = 1 − L/R_i  (positive ROC = concave mirror, Siegman convention).
    L, R1, R2 in metres.  Returns (g1, g2).
    """
    return 1.0 - L / R1, 1.0 - L / R2


def is_stable(g1, g2):
    """Stability condition:  0 ≤ g1·g2 ≤ 1."""
    prod = g1 * g2
    return bool(0.0 <= prod <= 1.0)


def stability_margin(g1, g2):
    """
    Distance from the nearest stability boundary in g1·g2 space.
    Returns value in [0, 0.5]: 0 = on boundary, 0.5 = maximally stable (confocal).
    Returns NaN for unstable cavities.
    """
    prod = g1 * g2
    if not (0.0 <= prod <= 1.0):
        return np.nan
    return min(prod, 1.0 - prod)


def gouy_phase_rt(g1, g2):
    """
    Round-trip Gouy phase in degrees.
    ψ = arccos(√(g1·g2))   [Siegman, Lasers, eq. 21.42]
    Returns NaN at boundary or for unstable cavities.
    """
    prod = g1 * g2
    if not (0.0 < prod < 1.0):
        return np.nan
    return np.degrees(np.arccos(np.sqrt(prod)))


def round_trip_matrix(L, R1, R2):
    """
    Round-trip ABCD matrix for a 2-mirror linear cavity, evaluated at mirror 1.
    M_rt = M_m1 @ M_prop @ M_m2 @ M_prop
    All lengths in metres.  Returns 2×2 numpy array.
    """
    M_prop = np.array([[1.0, L  ], [0.0,      1.0]])
    M_m1   = np.array([[1.0, 0.0], [-2.0/R1,  1.0]])
    M_m2   = np.array([[1.0, 0.0], [-2.0/R2,  1.0]])
    return M_m1 @ M_prop @ M_m2 @ M_prop


def cavity_mode(L, R1, R2, wavelength=1064e-9):
    """
    Self-consistent Gaussian eigenmode for a 2-mirror linear cavity.

    Solves  C·q² + (D−A)·q − B = 0  for the round-trip ABCD matrix.
    The discriminant  Tr(M)² − 4  must be negative for a stable Gaussian mode.

    Parameters
    ----------
    L, R1, R2   : cavity length and mirror ROCs, metres
    wavelength  : metres (default 1064 nm)

    Returns
    -------
    dict with keys:
      stable   – bool
      g1, g2   – g-parameters
      q1       – complex q at mirror 1 (None if unstable / planar)
      w0       – beam waist radius (m)
      d_waist  – waist distance from M1 toward M2 (m, positive = inside cavity)
      w1, w2   – beam radii at M1, M2 (m)
      z_R      – Rayleigh range (m)
    """
    g1, g2 = g_params(L, R1, R2)
    stable = is_stable(g1, g2)
    result = dict(stable=stable, g1=g1, g2=g2,
                  q1=None, w0=None, d_waist=None, w1=None, w2=None, z_R=None)

    M = round_trip_matrix(L, R1, R2)
    A, B, C, D = M[0, 0], M[0, 1], M[1, 0], M[1, 1]

    disc = (A + D)**2 - 4.0     # Tr(M)² − 4; negative ↔ stable Gaussian mode

    if not stable or disc >= 0.0 or abs(C) < 1e-15:
        return result

    im_q    = np.sqrt(-disc) / (2.0 * abs(C))   # = z_R (Rayleigh range)
    re_q    = (A - D) / (2.0 * C)
    q1      = complex(re_q, im_q)

    z_R     = im_q
    w0      = np.sqrt(wavelength * z_R / np.pi)
    d_waist = -re_q                              # positive = waist is between M1 and M2

    w1 = q_beam_radius(q1,     wavelength)
    w2 = q_beam_radius(q1 + L, wavelength)

    result.update(q1=q1, w0=w0, d_waist=d_waist, w1=w1, w2=w2, z_R=z_R)
    return result
