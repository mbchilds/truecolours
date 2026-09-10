# ISO 3166-1 alpha-2 codes for the 193 UN member states plus a few widely
# recognised extras (Vatican City, Palestine, Kosovo, Taiwan).
CODES = """
af al dz ad ao ag ar am au at az bs bh bd bb by be bz bj bt bo ba bw br bn bg bf bi
kh cm ca cv cf td cl cn co km cg cd cr ci hr cu cy cz dk dj dm do ec eg sv gq er ee sz et
fj fi fr ga gm ge de gh gr gd gt gn gw gy ht hn hu is in id ir iq ie il it jm jp jo kz ke ki
kp kr kw kg la lv lb ls lr ly li lt lu mg mw my mv ml mt mh mr mu mx fm md mc mn me ma mz mm
na nr np nl nz ni ne ng mk no om pk pw pa pg py pe ph pl pt qa ro ru rw kn lc vc ws sm st sa
sn rs sc sl sg sk si sb so za ss es lk sd sr se ch sy tj tz th tl tg to tt tn tr tm tv ug ua ae
gb us uy uz vu ve vn ye zm zw
va ps xk tw
""".split()

# Friendlier display names where flag-icons' names are awkward.
NAME_OVERRIDES = {
    "cd": "DR Congo",
    "cg": "Republic of the Congo",
    "ci": "Ivory Coast",
    "fm": "Micronesia",
    "gb": "United Kingdom",
    "us": "United States",
    "va": "Vatican City",
    "ps": "Palestine",
    "xk": "Kosovo",
    "tw": "Taiwan",
    "kp": "North Korea",
    "kr": "South Korea",
    "la": "Laos",
    "sy": "Syria",
    "ir": "Iran",
    "ru": "Russia",
    "vn": "Vietnam",
    "bo": "Bolivia",
    "ve": "Venezuela",
    "tz": "Tanzania",
    "md": "Moldova",
    "mk": "North Macedonia",
    "cz": "Czechia",
    "bn": "Brunei",
    "tl": "Timor-Leste",
    "sz": "Eswatini",
    "cv": "Cabo Verde",
    "st": "Sao Tome and Principe",
    "vc": "St Vincent and the Grenadines",
    "kn": "St Kitts and Nevis",
    "lc": "St Lucia",
    "ba": "Bosnia and Herzegovina",
    "ae": "United Arab Emirates",
    "tt": "Trinidad and Tobago",
    "ag": "Antigua and Barbuda",
    "mm": "Myanmar",
    "bs": "The Bahamas",
    "gm": "The Gambia",
    "nl": "Netherlands",
    "ph": "Philippines",
    "mh": "Marshall Islands",
    "sb": "Solomon Islands",
    "cf": "Central African Republic",
    "do": "Dominican Republic",
    "gq": "Equatorial Guinea",
    "gw": "Guinea-Bissau",
    "pg": "Papua New Guinea",
    "ss": "South Sudan",
    "za": "South Africa",
    "lk": "Sri Lanka",
    "ky": "Cayman Islands",
}

# Per-country overrides for the pre-fill rules (tools/build_flags.py).
#   STRICT      - only the plain "at least PREFILL_THRESHOLD" rule applies: small
#                 shapes are never rescued as fillable (use for busy emblems).
#   THRESHOLDS  - a custom minimum region size for that country (fraction of the
#                 flag), replacing PREFILL_THRESHOLD. Raise it to pre-fill more,
#                 lower it to let the player fill more.
STRICT = set("""

""".split())

THRESHOLDS = {
    # "hr": 0.02,
}

# ---------------------------------------------------------------------------
# GROUPS - hand-tuned region grouping, applied after the automatic rules.
# Each entry selects pixels of one colour and makes them behave as ONE region.
#   hex     colour to select (nearest colour in the flag's palette is used)
#   select  (optional filters, combined)
#     boxes   [(x0, y0, x1, y1), ...]  only pieces lying inside one of these boxes
#                                      (fractions of the flag width / height)
#     points  [(x, y), ...]            only the pieces containing these points
#     minor   True                     only pieces under PREFILL_THRESHOLD
#     major   True                     only pieces of at least PREFILL_THRESHOLD
#     small   True                     only pieces that are currently pre-filled
#   into    where the selected pixels go:
#     absent      -> they become one new fillable region (merged together)
#     (x, y)      -> they join the fillable region that contains this point
#     "nearest"   -> each piece joins the nearest fillable region of the same colour
# Typical uses: stripes of one colour fill together; stars fill together; an
# emblem drawn with black linework fills as one piece; a pre-filled sliver that
# gives a background colour away is absorbed into that background.
# ---------------------------------------------------------------------------
GROUPS = {
    # New Zealand: red star centres fill together
    "nz": [dict(hex="#c8102e", boxes=[(0.55, 0, 1, 1)])],
    # Venezuela: stars fill together
    "ve": [dict(hex="#ffffff", minor=True)],
    # Algeria: the white sliver by the star belongs to the white half
    "dz": [dict(hex="#ffffff")],
    # Zambia: eagle is one piece (linework stays); green between its legs is background
    "zm": [dict(hex="#ef7d00", minor=True), dict(hex="#198a00")],
    # Zimbabwe: star pieces cut by the bird are one star; bird is one piece
    "zw": [dict(hex="#d40000", points=[(0.24, 0.39), (0.11, 0.49), (0.26, 0.59)]), dict(hex="#ffcc00")],
    # Angola: machete blade + handle are one piece (cog and star stay separate)
    "ao": [dict(hex="#ffec00", points=[(0.39, 0.63), (0.55, 0.76)])],
    # Liechtenstein: crown gold is one piece
    "li": [dict(hex="#ffd83d")],
    # Mongolia: soyombo is one piece; the yin-yang holes belong to the left stripe
    "mn": [dict(hex="#ffd900"), dict(hex="#da2032", boxes=[(0, 0, 0.35, 1)])],
    # Liberia / Malaysia / USA: stripes of a colour fill together
    "lr": [dict(hex="#bf0a30"), dict(hex="#ffffff")],
    "my": [dict(hex="#cc0001"), dict(hex="#ffffff"), dict(hex="#ffcc00")],
    "us": [dict(hex="#bd3d44"), dict(hex="#ffffff", major=True), dict(hex="#ffffff", minor=True)],   # stripes; stars
    # Slovenia: mountain and rivers are one white piece
    "si": [dict(hex="#ffffff", boxes=[(0.1, 0.1, 0.4, 0.45)])],
    # Cabo Verde: stars fill together; each white stripe is one piece incl. the bits under stars
    "cv": [dict(hex="#ffce08"), dict(hex="#ffffff")],   # (the SVG joins both white stripes at the left, so they fill together)
    # Lesotho: white inside the hat belongs to the white stripe
    "ls": [dict(hex="#ffffff")],
    # Marshall Islands: blue slivers by the sun belong to the upper background
    "mh": [dict(hex="#3b5aa3", minor=True, into=(0.75, 0.25))],
    # Australia: stars fill together
    "au": [dict(hex="#ffffff", boxes=[(0.5, 0, 1, 1), (0.1, 0.55, 0.4, 1)])],
    # Azerbaijan / Malaysia: crescent + star are one piece
    "az": [dict(hex="#ffffff")],
    # Portugal: emblem greens/reds absorb into their backgrounds; yellow and white are single pieces
    "pt": [dict(hex="#006600", minor=True, into=(0.15, 0.5)), dict(hex="#ff0000", minor=True, into=(0.75, 0.5)),
           dict(hex="#ffff00"), dict(hex="#ffffff")],
    # Burundi: star outlines join the left green sector; star centres fill together
    "bi": [dict(hex="#18b637", minor=True, into=(0.12, 0.5)), dict(hex="#cf0921", minor=True)],
    # Sri Lanka: lion + sword one piece; four bo leaves one piece; red behind the lion is background
    "lk": [dict(hex="#ffb700", boxes=[(0.44, 0.25, 0.9, 0.75)]),
           dict(hex="#ffb700", boxes=[(0.33, 0.04, 0.46, 0.2), (0.86, 0.04, 0.99, 0.2), (0.33, 0.8, 0.46, 0.97), (0.86, 0.8, 0.99, 0.97)]),
           dict(hex="#8d2029", minor=True, into="nearest")],
    # Samoa: stars fill together
    "ws": [dict(hex="#ffffff")],
    # Ghana: the yellow sliver by the star belongs to the middle stripe
    "gh": [dict(hex="#fcd116")],
    # Israel: everything inside the star is background
    "il": [dict(hex="#ffffff")],
    # Taiwan: sun rays and disc are one piece
    "tw": [dict(hex="#ffffff")],
    # Cyprus: olive branches are one piece
    "cy": [dict(hex="#435125")],
    # Honduras: stars fill together
    "hn": [dict(hex="#18c3df", minor=True)],
    # Ethiopia: all yellow (star, rays and both halves of the stripe) is one piece
    "et": [dict(hex="#ffc621")],
    # Brunei: emblem yellow joins the lower yellow band; emblem red is one piece
    "bn": [dict(hex="#f7e017", minor=True, into=(0.37, 0.84)), dict(hex="#cf1126")],
}
