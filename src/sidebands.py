"""RF sideband generation, cavity reflection, and PDH error signals."""
import numpy as np
from scipy.special import jv


def R_from_finesse(F):
    """
    Mirror power reflectivity R for a symmetric cavity with finesse F.
    Solves  F = pi * sqrt(R) / (1 - R)  exactly.
    sqrt(R) = (-pi + sqrt(pi^2 + 4*F^2)) / (2*F)
    """
    u = (-np.pi + np.sqrt(np.pi**2 + 4.0 * F**2)) / (2.0 * F)
    return u ** 2


def bessel_coeffs(beta, max_order=3):
    """
    Bessel expansion coefficients J_n(beta) for n in [-max_order, max_order].
    Returns real array of length 2*max_order + 1.
    Uses J_{-n}(x) = (-1)^n * J_n(x) implicitly via scipy.special.jv.
    """
    ns = np.arange(-max_order, max_order + 1, dtype=float)
    return jv(ns, float(beta))


def reflection_coeff(delta_nu, fsr_hz, R1, R2):
    """
    Complex cavity reflection coefficient vs detuning delta_nu (Hz).

    r_cav(δ) = (ρ₁ − ρ₂ e^{iφ}) / (1 − ρ₁ρ₂ e^{iφ}),   φ = 2π δ / FSR

    Works element-wise for array-valued delta_nu.
    """
    rho1, rho2 = np.sqrt(R1), np.sqrt(R2)
    phi    = 2.0 * np.pi * np.asarray(delta_nu, dtype=float) / fsr_hz
    exp_ip = np.exp(1j * phi)
    return (rho1 - rho2 * exp_ip) / (1.0 - rho1 * rho2 * exp_ip)


def reflected_power(delta_nu_arr, fsr_hz, R1, R2, beta, f_mod_hz, max_order=3):
    """
    Detected reflected power (normalized to input) vs cavity detuning.
    Includes all sideband orders n in [-max_order, max_order].

    P(δ) = Σ_n  J_n(β)²  |r_cav(δ + n·f_mod)|²
    """
    Jn    = bessel_coeffs(beta, max_order)
    power = np.zeros(len(delta_nu_arr), dtype=float)
    for n in range(-max_order, max_order + 1):
        r = reflection_coeff(delta_nu_arr + n * f_mod_hz, fsr_hz, R1, R2)
        power += Jn[n + max_order] ** 2 * np.abs(r) ** 2
    return power


def demod_amplitudes(delta_nu_arr, fsr_hz, R1, R2, beta, f_mod_hz, max_order=3):
    """
    Complex demodulation amplitudes at harmonics k = 1, 2, 3.

    The detected power contains a term at k·Ω:
        P(t)|_{kΩ} = 2 Re(A_k · e^{ikΩt})

    where  A_k(δ) = Σ_n  J_n(β) J_{n-k}(β)  r_n(δ) r_{n-k}(δ)*

    and r_n(δ) = r_cav(δ + n·f_mod).

    Returns dict with keys A1, A2, A3 (complex) and
    I1, Q1, I2, Q2, I3, Q3 (real: I = Re(A), Q = −Im(A)).
    """
    delta = np.asarray(delta_nu_arr, dtype=float)
    Jn    = bessel_coeffs(beta, max_order)

    r = {n: reflection_coeff(delta + n * f_mod_hz, fsr_hz, R1, R2)
         for n in range(-max_order, max_order + 1)}

    out = {}
    for k in [1, 2, 3]:
        Ak = np.zeros(len(delta), dtype=complex)
        for n in range(-max_order, max_order + 1):
            m = n - k
            if abs(m) > max_order:
                continue
            Ak += Jn[n + max_order] * Jn[m + max_order] * r[n] * np.conj(r[m])
        out[f'A{k}'] = Ak
        out[f'I{k}'] =  Ak.real          # in-phase  (demod at 0°)
        out[f'Q{k}'] = -Ak.imag          # quadrature (demod at 90°)
    return out


def pdh_signal(delta_nu_arr, fsr_hz, R1, R2, beta, f_mod_hz,
               demod_phase_deg=0.0, harmonic=1, max_order=3):
    """
    PDH error signal at given harmonic and demodulation phase:
        err(δ) = Re(A_k · e^{iφ_demod})

    φ_demod = 0°  → I quadrature (standard for off-resonance sidebands)
    φ_demod = 90° → Q quadrature
    """
    amps = demod_amplitudes(delta_nu_arr, fsr_hz, R1, R2, beta, f_mod_hz, max_order)
    phi  = np.radians(demod_phase_deg)
    return (amps[f'A{harmonic}'] * np.exp(1j * phi)).real


def sideband_input_spectrum(f_mod_hz, beta, max_order=3):
    """
    Input field power spectrum (before cavity): |J_n(β)|² at n·f_mod.
    Returns (frequencies_hz, powers) arrays.
    """
    ns     = np.arange(-max_order, max_order + 1, dtype=float)
    freqs  = ns * f_mod_hz
    powers = jv(ns, float(beta)) ** 2
    return freqs, powers
