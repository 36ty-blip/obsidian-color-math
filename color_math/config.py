# config.py

from .custom_definitions import (
    CUSTOM_FUNCTIONS,
    CUSTOM_CONSTANTS,
    CUSTOM_OPERATORS,
    CUSTOM_QUANTUM_OPERATORS,
    CUSTOM_RELATIONS,
    sanitize_definition,
)

CUSTOM_MACRO_FUNCTIONS: set[str] = set()
CUSTOM_BARE_FUNCTIONS: set[str] = set()
for _fn in CUSTOM_FUNCTIONS:
    _m, _b = sanitize_definition(_fn)
    if _m:
        CUSTOM_MACRO_FUNCTIONS.add(_m)
    if _b:
        CUSTOM_BARE_FUNCTIONS.add(_b.lower())

CUSTOM_CONSTANTS_SET: set[str] = set()
for _c in CUSTOM_CONSTANTS:
    _m, _b = sanitize_definition(_c)
    if _m:
        CUSTOM_CONSTANTS_SET.add(_m)
    if _b:
        CUSTOM_CONSTANTS_SET.add(_b)

CUSTOM_OPERATORS_SET: set[str] = set()
for _op in CUSTOM_OPERATORS:
    _m, _ = sanitize_definition(_op)
    if _m:
        CUSTOM_OPERATORS_SET.add(_m)

CUSTOM_QUANTUM_OPERATORS_SET: set[str] = {q.strip() for q in CUSTOM_QUANTUM_OPERATORS if q.strip()}

CUSTOM_RELATIONS_SET: set[str] = set()
for _r in CUSTOM_RELATIONS:
    _m, _b = sanitize_definition(_r)
    if _m:
        CUSTOM_RELATIONS_SET.add(_m)
    if _b and not _b.startswith("\\"):
        CUSTOM_RELATIONS_SET.add(_b)

COLORS = {
    "main": "#7aa2f7",
    "orange": "#e0af68",
    "dot": "white",
    "derivative": "#bb9af7",
    "chain": "#9ece6a",
    "upper": "#bb9af7",
    "relation": "white",
    "arrow": "#f7768e",
    "set": "#bb9af7",
    "spacing": "white",
}


BIG_OPERATORS = {
    r"\sum",
    r"\prod",
    r"\coprod",
    r"\bigcup",
    r"\bigcap",
    r"\bigsqcup",
    r"\bigvee",
    r"\bigwedge",
    r"\bigoplus",
    r"\bigotimes",
}


INTEGRALS = {
    r"\int",
    r"\iint",
    r"\iiint",
    r"\oint",
}


LIMIT_OPERATORS = {
    r"\lim",
    r"\sup",
    r"\inf",
    r"\max",
    r"\min",
}


RELATIONS = {
    r"\neq",
    r"\leq",
    r"\geq",
    r"\approx",
    r"\sim",
    r"\equiv",
    r"\propto",
    "=",
    "<",
    ">",
} | CUSTOM_RELATIONS_SET


ARROWS = {
    r"\longrightarrow",
    r"\longleftarrow",
    r"\leftrightarrow",
    r"\rightarrow",
    r"\leftarrow",
    r"\Rightarrow",
    r"\Leftarrow",
    r"\Leftrightarrow",
    r"\mapsto",
    r"\to",
}


SET_SYMBOLS = {
    r"\notin",
    r"\subseteq",
    r"\supseteq",
    r"\subset",
    r"\supset",
    r"\setminus",
    r"\emptyset",
    r"\in",
    r"\cup",
    r"\cap",
}


SPACING_COMMANDS = {
    r"\,",
    r"\:",
    r"\;",
    r"\quad",
    r"\qquad",
}


MULTIPLICATION_SYMBOLS = {
    r"\cdot",
    r"\times",
    "·",
    "*",
}


# Combined commands that should receive special coloring
COLOR_COMMANDS = (
    BIG_OPERATORS
    | INTEGRALS
    | LIMIT_OPERATORS
    | RELATIONS
    | ARROWS
    | SET_SYMBOLS
    | SPACING_COMMANDS
    | MULTIPLICATION_SYMBOLS
    | CUSTOM_OPERATORS_SET
)


# Longest first so scanner matches \longrightarrow before \to
SORTED_COLOR_COMMANDS = sorted(
    COLOR_COMMANDS,
    key=len,
    reverse=True,
)
