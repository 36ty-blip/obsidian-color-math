# config.py

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
}


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
)


# Longest first so scanner matches \longrightarrow before \to
SORTED_COLOR_COMMANDS = sorted(
    COLOR_COMMANDS,
    key=len,
    reverse=True,
)
