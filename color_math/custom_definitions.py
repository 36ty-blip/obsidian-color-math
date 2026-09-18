r"""
COLOR MATH - USER CUSTOM DEFINITIONS
=====================================

This file allows you to add any custom mathematical symbols, functions,
constants, or operators without modifying the parser or regex internals.

HOW TO USE:
1. Add your desired names/macros to the lists below.
2. You can write them WITH or WITHOUT a leading backslash:
   - "relu" or r"\relu"
   - "sinc" or r"\sinc"
   - "kB" or r"\kB"
3. Do NOT add parentheses "()". The system matches them automatically!
4. Save the file.
"""

from __future__ import annotations
import re

# 1. Machine Learning & Signal Processing Functions
# Matched both as \relu(x), \relu x, and bare relu(x)
CUSTOM_FUNCTIONS: list[str] = [
    "sinc",
    "relu",
    "gelu",
    "swish",
    "silu",
    "softmax",
    "softplus",
    "sigmoid",
    "mish",
    "loss",
]

# 2. Physical & Mathematical Constants
# Colored with your constant theme (orange/gold)
CUSTOM_CONSTANTS: list[str] = [
    r"\kB",        # Boltzmann constant
    r"\muB",       # Bohr magneton
    r"\epsZero",   # Vacuum permittivity
    r"\NA",        # Avogadro's number
]

# 3. Vector Calculus & Differential Operators
# Colored like \sum, \int, \lim
CUSTOM_OPERATORS: list[str] = [
    r"\grad",
    r"\curl",
    r"\div",
    r"\laplacian",
    r"\Box",
]

# 4. Quantum Mechanics Operators
# Colored with quantum accent
CUSTOM_QUANTUM_OPERATORS: list[str] = [
    r"\hat{a}",
    r"\hat{a}^\dagger",
    r"\hat{b}",
    r"\hat{b}^\dagger",
    r"\hat{c}",
    r"\hat{c}^\dagger",
    r"\hat{\rho}",
    r"\hat{H}",
    r"\hat{p}",
    r"\hat{x}",
    r"\hat{L}",
    r"\hat{S}",
    r"\hat{J}",
]

# 5. Custom Relations & Assignment Symbols
# Colored with relation theme (white/contrast)
CUSTOM_RELATIONS: list[str] = [
    r"\coloneqq",  # :=
    r"\eqqcolon",  # =:
    r"\triangleq",
]

# 6. Custom Parameters (Greek / symbols)
CUSTOM_PARAMETERS: list[str] = []


def sanitize_definition(raw: str) -> tuple[str, str]:
    """
    Sanitizes an input symbol definition:
    - Strips whitespace
    - Strips trailing parentheses () or (...)
    - Returns (macro, bare)
    """
    cleaned = raw.strip()
    cleaned = re.sub(r"\s*\([^)]*\)\s*$", "", cleaned).strip()
    if cleaned.startswith("\\"):
        macro = cleaned
        bare = cleaned.lstrip("\\").strip()
    else:
        macro = "\\" + cleaned
        bare = cleaned
    return macro, bare
