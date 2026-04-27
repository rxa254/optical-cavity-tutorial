"""Core cavity physics: finesse, FSR, linewidth, power buildup, coupling spectra."""
import numpy as np
from scipy.constants import c as C


def finesse(R1, R2):
    """
    Cavity finesse from mirror power reflectivities R1, R2.

    F = pi * sqrt(r) / (1 - r),  where r = sqrt(R1 * R2) is the
    round-trip amplitude reflectivity.  (Siegman, Lasers, eq. 11.52)
    """
    r = np.sqrt(R1 * R2)          # round-trip amplitude reflectivity
    return np.pi * np.sqrt(r) / (1.0 - r)


def fsr(L, cavity_type="linear"):
    """
    Free spectral range in Hz.
    L: cavity length in metres.
    cavity_type: 'linear' (2L round trip) or 'ring' (L round trip).
    """
    n_trips = 2.0 if cavity_type == "linear" else 1.0
    return C / (n_trips * L)


def linewidth(F, fsr_hz):
    """FWHM power linewidth in Hz."""
    return fsr_hz / F


def power_buildup(R1, R2):
    """
    Peak circulating-to-input power ratio at resonance.

    B = (1 - R1) / (1 - sqrt(R1 * R2))^2
    where R1 is the input coupler power reflectivity.
    """
    r = np.sqrt(R1 * R2)
    return (1.0 - R1) / (1.0 - r) ** 2


def coupling_status(R1, R2, tol=0.002):
    """
    Coupling regime for a lossless 2-mirror cavity.
    Returns 'critical', 'over', or 'under'.
    Critical coupling: amplitude reflectivities equal → zero on-resonance reflection.
    """
    rho1, rho2 = np.sqrt(R1), np.sqrt(R2)
    if abs(rho1 - rho2) / max(rho1, rho2) < tol:
        return "critical"
    return "over" if rho1 < rho2 else "under"


def circulating_spectrum(delta_nu, fsr_hz, R1, R2):
    """
    Intracavity circulating power / input power vs detuning from resonance.

    delta_nu: frequency detuning in Hz (scalar or ndarray).
    Returns the exact Airy function.
    """
    r1, r2 = np.sqrt(R1), np.sqrt(R2)
    phi = 2.0 * np.pi * delta_nu / fsr_hz
    denom = (1.0 - r1 * r2) ** 2 + 4.0 * r1 * r2 * np.sin(phi / 2.0) ** 2
    return (1.0 - R1) / denom


def reflection_spectrum(delta_nu, fsr_hz, R1, R2):
    """
    Reflected power / input power vs detuning from resonance.
    Exact Airy formula for a lossless 2-mirror cavity.
    """
    r1, r2 = np.sqrt(R1), np.sqrt(R2)
    phi = 2.0 * np.pi * delta_nu / fsr_hz
    sin2 = np.sin(phi / 2.0) ** 2
    num = (r1 - r2) ** 2 + 4.0 * r1 * r2 * sin2
    den = (1.0 - r1 * r2) ** 2 + 4.0 * r1 * r2 * sin2
    return num / den
