# Flags needing manual rework

Flags from the flagcheck review (30 Sep 2026) that can't be fixed by a `GROUPS` rule
in `tools/countries.py` and need hands-on work (usually editing the SVG or a bespoke
region map). Leave until the end of the review pass, then do together.

| Code | Flag | What's wrong / wanted |
|------|------|------------------------|
| ec | Ecuador | Emblem is very complex; needs manual handling (no detail given yet). |
| gq | Equatorial Guinea | The banner under the emblem was cut out badly; needs manual checking. |
| fj | Fiji | Detail lost in the lower-left quarter of the crest. |
| sm | San Marino | All the light blue of the bottom stripe should be one region (possibly including the emblem centre *if* it's the exact same shade; otherwise pre-fill that). Background bits between the leaves and the emblem should join the white top stripe. |
| va | Vatican City | Detail lost in the emblem on the right-hand side. |
| af | Afghanistan | Detail lost in the centre emblem. |
| bz | Belize | Needs a manual look (details not specified yet). |
| bo | Bolivia | Needs a manual look (details not specified yet). |
| mt | Malta | A little emblem linework detail is being lost. |
| md | Moldova | Needs a manual look (details not specified yet). |
| ni | Nicaragua | Needs a manual look (details not specified yet). |
| py | Paraguay | Needs a manual look (details not specified yet). |
| tm | Turkmenistan | Needs a manual rework (details not specified yet). |

Handled automatically: Portugal's linework (black linework was being swallowed by the fills - now kept as fixed lines).
The eight flags added after the 30 Sep re-check (af to tm) have had automatic region changes already; the manual work is on top of that.
