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

# Flags temporarily taken out of the game (Daily Challenge and Quick Play) because they still need
# manual rework - see tools/manual_rework.md. They stay in the catalogue (flagcheck.html still shows
# them) and are written to manifest.json as "excluded"; js/game.js skips them. Remove a code from
# this set and rebuild the manifest to put a flag back. This does NOT touch CODES, so the Daily
# order for every other day is unchanged.
EXCLUDED = set("""
ec gq fj sm va af bz bo mt md ni py tm
""".split())

# ---------------------------------------------------------------------------
# GROUPS - hand-tuned region grouping, applied after the automatic rules.
# Each entry selects pixels of one colour and makes them behave as ONE region.
#   hex     colour to select (nearest colour in the flag's palette is used)
#   select  (optional filters, combined)
#     boxes   [(x0, y0, x1, y1), ...]  only pieces WHOLLY inside one of these boxes
#                                      (fractions of the flag width / height)
#     points  [(x, y), ...]            only the pieces containing these points
#     minor   True                     only pieces under PREFILL_THRESHOLD
#     major   True                     only pieces of at least PREFILL_THRESHOLD
#     small   True                     only pieces that are currently pre-filled
#     below   0.05                     only pieces smaller than this fraction of the flag
#     above   0.05                     only pieces at least this big
#     rect    [(x0, y0, x1, y1), ...]  pixels of this colour inside these boxes,
#                                      regardless of which connected piece they
#                                      belong to - use this (instead of boxes/points)
#                                      when the thing you want has no colour
#                                      boundary from its neighbour at all (e.g. a
#                                      figure's trousers drawn as a gap in the
#                                      outline, left as the same fill as the
#                                      background behind it) so per-piece selection
#                                      can't isolate it. Skips boxes/points/minor/
#                                      major/small - it's a separate, simpler path.
#   into    where the selected pixels go:
#     absent      -> they become one new fillable region (merged together)
#     (x, y)      -> they join the fillable region that contains this point
#     "nearest"   -> each piece joins the nearest fillable region of the same colour
#     "prefill"   -> they become pre-filled (removed from play) - for turning a
#                    region that is currently fillable (or a small piece that would
#                    otherwise qualify) into fixed detail
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
    "ao": [dict(hex="#ffec00", points=[(0.39, 0.63), (0.55, 0.76)]), dict(hex="#000001"),
           dict(hex="#ffec00", points=[(0.459, 0.348), (0.278, 0.710)])],   # the two halves of the cog fill together
    # Liechtenstein: crown gold is one piece
    "li": [dict(hex="#ffd83d"), dict(hex="#000000", into="prefill")],
    # Mongolia: soyombo is one piece; the yin-yang holes belong to the left stripe
    "mn": [dict(hex="#ffd900"), dict(hex="#da2032", boxes=[(0, 0, 0.35, 1)])],
    # Liberia / Malaysia / USA: stripes of a colour fill together
    "lr": [dict(hex="#bf0a30"), dict(hex="#ffffff"), dict(hex="#ffffff", points=[(0.169, 0.228)])],   # stripes together; the canton star is its own piece
    "my": [dict(hex="#cc0001"), dict(hex="#ffffff"), dict(hex="#ffcc00")],
    "us": [dict(hex="#bd3d44"), dict(hex="#ffffff", major=True), dict(hex="#ffffff", minor=True)],   # stripes; stars
    # Slovenia: mountain and rivers are one white piece
    "si": [dict(hex="#ffffff", boxes=[(0.1, 0.1, 0.4, 0.45)]), dict(hex="#d50000")],
    # Cabo Verde: stars fill together; each white stripe is one piece incl. the bits under stars
    # the SVG joins both white stripes at the left, so they're split by position: one region per white stripe
    "cv": [dict(hex="#ffce08"), dict(hex="#ffffff", rect=[(0.0, 0.0, 1.0, 0.63)]), dict(hex="#ffffff", rect=[(0.0, 0.63, 1.0, 1.0)])],
    # Lesotho: white inside the hat belongs to the white stripe
    "ls": [dict(hex="#ffffff")],
    # Marshall Islands: blue slivers by the sun belong to the upper background
    "mh": [dict(hex="#3b5aa3", minor=True, into=(0.03, 0.03))],
    # Australia: stars fill together
    "au": [dict(hex="#ffffff", boxes=[(0.5, 0, 1, 1), (0.1, 0.55, 0.4, 1)])],
    # Azerbaijan / Malaysia: crescent + star are one piece
    "az": [dict(hex="#ffffff")],
    # Portugal: emblem greens/reds absorb into their backgrounds; yellow and white are single pieces
    "pt": [dict(hex="#006600", minor=True, into=(0.15, 0.5)), dict(hex="#ff0000", minor=True, into=(0.75, 0.5)),
           dict(hex="#ffff00"), dict(hex="#ffffff"),
           dict(hex="#000000", into="prefill")],   # hairline linework stays visible instead of being absorbed into the fills
    # Burundi: star outlines join the left green sector; star centres fill together
    "bi": [dict(hex="#18b637", minor=True, into=(0.12, 0.5)), dict(hex="#cf0921", minor=True)],
    # Sri Lanka: lion + sword one piece; four bo leaves one piece; red behind the lion is background
    "lk": [dict(hex="#ffb700", boxes=[(0.44, 0.25, 0.9, 0.75)]),
           dict(hex="#ffb700", boxes=[(0.33, 0.04, 0.46, 0.2), (0.86, 0.04, 0.99, 0.2), (0.33, 0.8, 0.46, 0.97), (0.86, 0.8, 0.99, 0.97)],
                into=(0.336, 0.033)),   # the four corner leaves join the gold border line
           dict(hex="#8d2029", minor=True, into="nearest"),
           dict(hex="#000000", into="prefill")],
    # Samoa: stars fill together
    "ws": [dict(hex="#ffffff")],
    # Ghana: the yellow sliver by the star belongs to the middle stripe
    "gh": [dict(hex="#fcd116")],
    # Israel: only the bits inside/around the star join the centre background -
    # the top and bottom white margins stay their own fillable regions
    "il": [dict(hex="#ffffff", boxes=[(0.0, 0.15, 1.0, 0.85)])],
    # Taiwan: sun rays and disc are one piece
    "tw": [dict(hex="#ffffff")],
    # Cyprus: olive branches are one piece
    "cy": [dict(hex="#435125")],
    # Honduras: stars fill together
    "hn": [dict(hex="#18c3df", minor=True)],
    # Ethiopia: all yellow (star, rays and both halves of the stripe) is one piece
    "et": [dict(hex="#ffc621")],
    # Brunei: emblem yellow joins the lower yellow band; emblem red is one piece
    "bn": [dict(hex="#f7e017", minor=True, into=(0.37, 0.84)), dict(hex="#cf1126"), dict(hex="#000000")],
    # Moldova: the eagle (all brown) is one piece; the olive branch in its talon
    # (green, plus its darker shading) is a separate single piece
    "md": [dict(hex="#a77b3b"), dict(hex="#008f00"), dict(hex="#008500", into=(0.273, 0.479)),
           # the yellow gaps between the eagle's legs and wings are background (centre stripe)
           dict(hex="#ffde00", boxes=[(0.36, 0.59, 0.41, 0.73), (0.58, 0.59, 0.65, 0.74)], into=(0.5, 0.92)),
           # all yellow in the emblem (cross, stars, diamonds, eyes, flower, crescent, sceptre) is one hue with the bull's head
           dict(hex="#ffff00")],
    # Belize: the wreath's leaves (both greens used around the ring and in the
    # tree) fill together; the grass tufts under the men's feet (same green as
    # the tree) are pre-filled instead of playable; each man's trousers are drawn
    # as a gap in the outline with no colour boundary from the background behind
    # them, so they're carved out by position and pre-filled
    "bz": [
        dict(hex="#289400", boxes=[(0.30, 0.15, 0.70, 0.42)]),
        dict(hex="#289400", boxes=[(0.25, 0.55, 0.75, 0.75)], into="prefill"),
        dict(hex="#ffffff", major=True),   # inner circle + outer ring are one background (before the trousers are carved out)
        dict(hex="#ffffff", rect=[(0.3225, 0.43, 0.425, 0.64), (0.58125, 0.43, 0.68125, 0.64)], into="prefill"),
    ],
    # Tuvalu: the nine stars fill together
    "tv": [dict(hex="#fff40d")],
    # Bhutan: the whole orange half and the whole yellow half are each a single
    # piece - no sliver of either colour is cut off and pre-filled by the dragon
    "bt": [dict(hex="#ffd520"), dict(hex="#ff4e12")],
    # Comoros: the four stars fill together (the crescent and the white stripe
    # stay as they are)
    "km": [dict(hex="#ffffff", points=[(0.2125, 0.343), (0.2125, 0.445), (0.2125, 0.547), (0.2125, 0.65)])],
    # Papua New Guinea: the red bird-of-paradise background is one piece (no
    # pre-filled sliver); all five Southern Cross stars fill together
    "pg": [dict(hex="#ff0000"), dict(hex="#ffffff")],
    # Iran: the whole national emblem (the two side crescents and the small
    # flourish above, as well as the central sword shape) is one piece - the
    # background red stripe is untouched
    "ir": [dict(hex="#da0000", boxes=[(0.35, 0.30, 0.65, 0.70)])],
    # China: all five stars fill together
    "cn": [dict(hex="#ffff00")],
    # Saudi Arabia: the shahada text and sword are one white piece; the green
    # background (including any sliver the script would otherwise cut off) is
    # the other - two regions total, no pre-fill
    "sa": [dict(hex="#165d31"), dict(hex="#ffffff")],

    # ------------------------------------------------------------------
    # Review pass (flagcheck notes, 30 Sep 2026). Recurring themes: emblem
    # detail that is the same hue as a background stripe belongs to that
    # stripe's region (so a pre-filled sliver can't give the colour away);
    # repeated shapes of one colour (stars, crescent+star) fill together.
    # ------------------------------------------------------------------
    # Afghanistan / Albania: emblem reds belong to the red stripe / field
    "af": [dict(hex="#bf0000")],
    "al": [dict(hex="#ff0000")],
    # Andorra: the crest's gold border is one piece (its brown linework stays as fixed lines); crest
    # yellow is the exact stripe yellow so it joins the stripe; the crest's red is a different shade
    # from the stripe red, so it stays pre-filled
    "ad": [dict(hex="#c7b37f"), dict(hex="#fedf00"), dict(hex="#703d29", into="prefill")],
    # Belarus: all red is one region; the white ornament band is one region
    "by": [dict(hex="#ce1720"), dict(hex="#ffffff")],
    # Bolivia: the emblem's red banners are fixed detail - only the three stripes play
    "bo": [dict(hex="#d52b1e", minor=True, into="prefill")],
    # Bosnia: stars are one region; the blue sliver joins the main blue
    "ba": [dict(hex="#ffffff"), dict(hex="#000099")],
    # Brazil: the white motto band is fixed detail (the green lettering is a different hue, so it stays too)
    "br": [dict(hex="#ffffff", into="prefill")],
    # Cambodia: the temple is one white region; its black linework stays as fixed lines
    "kh": [dict(hex="#ffffff"), dict(hex="#000000", into="prefill")],
    # Croatia: one red, one dark blue, one white region for the whole flag (crest included)
    "hr": [dict(hex="#ff0000"), dict(hex="#171796"), dict(hex="#ffffff")],
    # Egypt: eagle gold is one piece; eagle white belongs to the white stripe
    "eg": [dict(hex="#ffffff"), dict(hex="#c09300")],
    # Eswatini: shield white (+ spearheads) one region; shield black one region;
    # spear yellow joins the top yellow stripe
    "sz": [dict(hex="#ffffff"), dict(hex="#000000"), dict(hex="#ffd900", minor=True, into=(0.5, 0.22))],
    # Georgia: the four corner crosses join the centre cross
    "ge": [dict(hex="#ff0000")],
    # Greece / Iceland / India / Kosovo / Kyrgyzstan / Libya / Mauritania / ...: one region per colour
    "gr": [dict(hex="#ffffff"), dict(hex="#0d5eaf")],
    "is": [dict(hex="#ffffff")],
    "in": [dict(hex="#ffffff"), dict(hex="#000088")],
    "xk": [dict(hex="#ffffff")],
    "kg": [dict(hex="#ff0000"), dict(hex="#ffff00")],
    "ly": [dict(hex="#ffffff")],
    "mr": [dict(hex="#ffc400")],
    "fm": [dict(hex="#ffffff")],
    "sb": [dict(hex="#ffffff")],
    "kr": [dict(hex="#000000")],
    "kn": [dict(hex="#ffffff")],
    "tr": [dict(hex="#ffffff")],
    "mm": [dict(hex="#34b233")],
    "ph": [dict(hex="#fcd116")],
    "py": [dict(hex="#ffffff")],
    "ni": [dict(hex="#ffffff")],
    "iq": [dict(hex="#007a3d"), dict(hex="#ffffff")],
    "jo": [dict(hex="#ffffff")],
    "kz": [dict(hex="#00abc2"), dict(hex="#ffec2d")],
    "lb": [dict(hex="#ffffff")],
    "ma": [dict(hex="#c1272d"), dict(hex="#006233")],
    "na": [dict(hex="#ffe700"), dict(hex="#3662a2")],
    "om": [dict(hex="#ffffff"), dict(hex="#ef2d29")],
    "tg": [dict(hex="#118600"), dict(hex="#ffe300")],
    # Grenada: stars + the nutmeg's yellow are one region (the two big triangles stay apart); all red is one region
    "gd": [dict(hex="#fcd116", below=0.05), dict(hex="#ce1126")],
    # Guatemala: the scroll is fixed detail; the emblem's white belongs to the white stripe
    "gt": [dict(hex="#f9f0aa", into="prefill"), dict(hex="#ffffff")],
    # Kenya: each white stripe is one region (shield splits it in two); spearheads + spear butts are one
    # region; the five white shapes in the shield are one region
    "ke": [dict(hex="#ffffff", points=[(0.018, 0.323), (0.605, 0.323)]),
           dict(hex="#ffffff", points=[(0.018, 0.673), (0.605, 0.673)]),
           dict(hex="#ffffff", points=[(0.386, 0.238), (0.604, 0.258), (0.417, 0.688), (0.581, 0.688)]),
           dict(hex="#ffffff", points=[(0.485, 0.327), (0.514, 0.327), (0.485, 0.662), (0.514, 0.662), (0.499, 0.498)]),
           dict(hex="#000001", below=0.05)],   # the two black shield sides fill together
    # Kiribati: waves of a colour fill together; bird, sun centre and flames are one gold piece
    "ki": [dict(hex="#005989"), dict(hex="#ffffff"), dict(hex="#fec74a"), dict(hex="#000000", into="prefill")],   # bird/sun linework (recoloured black in ki.svg) stays as fixed lines
    # Malawi: the sun's rays join its semicircle
    "mw": [dict(hex="#f41408", boxes=[(0.2, 0.0, 0.8, 0.36)])],
    # Malta: only red and white play; the George Cross detail is fixed
    "mt": [dict(hex="#cf142b"), dict(hex="#ffffff"), dict(hex="#000000", into="prefill")],
    # Montenegro: gold and red only - the bronze shading, blues and greens are fixed detail
    "me": [dict(hex="#d3ae3b"), dict(hex="#c40308"), dict(hex="#c52126", into=(0.1, 0.5)), dict(hex="#b96b29", into="prefill")],
    # Mozambique: gun and hoe are fixed black; star fills as one piece; book joins the white stripes; all red together
    "mz": [dict(hex="#000001", points=[(0.159, 0.437)], into="prefill"), dict(hex="#ffca00", below=0.05),
           dict(hex="#ffffff"), dict(hex="#ff0000")],
    # North Macedonia: all rays fill together; the centre disc is its own piece
    "mk": [dict(hex="#ffe600"), dict(hex="#ffe600", points=[(0.5, 0.5)])],
    # Pakistan: crescent and star fill together (not the white stripe)
    "pk": [dict(hex="#ffffff", boxes=[(0.25, 0.0, 1.0, 1.0)])],
    # Rwanda: all blue together; sun and rays are one yellow piece
    "rw": [dict(hex="#00a1de"), dict(hex="#e5be01")],
    # Serbia: all red together; the emblem's gold is fixed detail
    "rs": [dict(hex="#c6363c"), dict(hex="#edb92e", into="prefill"), dict(hex="#ffffff"), dict(hex="#0c4076"),
           dict(hex="#21231e", into="prefill")],   # all white (stripe + emblem) and all blue are one region each; feather linework stays
    # Singapore: crescent and stars fill together
    "sg": [dict(hex="#ffffff", boxes=[(0.0, 0.0, 0.6, 0.5)])],
    # Slovakia: the blue stripe is one piece (the emblem's blue hills stay separate)
    "sk": [dict(hex="#0b4ea2", points=[(0.05, 0.5), (0.9, 0.5)])],
    # Spain: emblem reds join the top stripe; emblem yellow of the same hue joins the yellow stripe
    "es": [dict(hex="#aa151b", minor=True, into=(0.8, 0.1)), dict(hex="#f1bf00")],
    # St Vincent: the three green diamonds fill together
    "vc": [dict(hex="#199a00", below=0.05)],
    # Tajikistan: crown/stars gold is one piece; the white gap in the emblem joins the white stripe
    "tj": [dict(hex="#f8c300"), dict(hex="#ffffff")],
    # Tunisia: crescent and star fill together
    "tn": [dict(hex="#e70013", below=0.05)],
    # Turkmenistan: all carpet-band red is one region; crescent and five stars fill together
    "tm": [dict(hex="#d22630"), dict(hex="#ffffff", boxes=[(0.38, 0.05, 0.75, 0.42)])],
    # Uganda: emblem black joins the centre black stripe, emblem yellow the top yellow stripe
    "ug": [dict(hex="#000001", minor=True, into=(0.05, 0.58)), dict(hex="#ffe700", minor=True, into=(0.1, 0.25)),
           dict(hex="#de3108", into=(0.1, 0.42))],   # the crane's orange is visually the stripe orange (dE ~2)
    # Uruguay: sun gold is one playable piece, its black rays are fixed; all white / all blue one region each
    "uy": [dict(hex="#ffffff"), dict(hex="#0038a8"), dict(hex="#fcd116"), dict(hex="#000000", into="prefill")],
    # Uzbekistan: crescent and stars fill together
    "uz": [dict(hex="#ffffff", boxes=[(0.0, 0.0, 0.7, 0.4)])],
    # Vanuatu: the crossed fronds join the tusk swirl
    "vu": [dict(hex="#fdce12", boxes=[(0.0, 0.3, 0.3, 0.72)])],
    # Argentina: the Sun of May (disc and all its rays) is one playable piece; its brown facial linework stays fixed
    "ar": [dict(hex="#f6b40e"), dict(hex="#85340a", into="prefill")],
}
