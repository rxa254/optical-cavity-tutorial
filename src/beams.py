"""Gaussian beam optics and ABCD matrix propagation."""
import numpy as np


def rayleigh_range(w0, wavelength):
    """Rayleigh range in metres.  w0 and wavelength in metres."""
    return np.pi * w0**2 / wavelength


def q_beam_radius(q, wavelength):
    """
    Beam radius w from complex q-parameter (metres).
    Uses 1/q = 1/R - i*lambda/(pi*w^2)  →  w = sqrt(-lambda / (pi * Im(1/q))).
    """
    inv_q = 1.0 / np.asarray(q, dtype=complex)
    return np.sqrt(-wavelength / (np.pi * inv_q.imag))


def q_wavefront_radius(q):
    """Wavefront radius of curvature R from complex q-parameter (metres)."""
    re_inv = np.real(1.0 / np.asarray(q, dtype=complex))
    with np.errstate(divide='ignore'):
        return np.where(re_inv == 0.0, np.inf, 1.0 / re_inv)


def abcd_propagate(q, M):
    """
    Propagate complex q-parameter through ABCD matrix M = [[A,B],[C,D]].
    Returns q_out = (A*q + B) / (C*q + D).
    """
    A, B, C, D = M[0, 0], M[0, 1], M[1, 0], M[1, 1]
    return (A * q + B) / (C * q + D)


def beam_caustic(q0, z_array, wavelength):
    """
    Beam radius w(z) for free-space propagation starting from q0.
    q0      : complex q at z = 0 (metres).
    z_array : 1-D array of propagation distances (metres).
    Returns array of beam radii in metres.
    """
    q_z = q0 + np.asarray(z_array, dtype=complex)
    return q_beam_radius(q_z, wavelength)
