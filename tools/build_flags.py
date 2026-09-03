#!/usr/bin/env python3
"""
build_flags.py - turns flag SVGs into "colouring book" region maps.

For every country it:
  1. rasterises the flag (no anti-aliasing, so every pixel is an exact flag colour)
  2. finds every contiguous block of a single colour ("region")
  3. decides which regions the player fills (see the settings below) and pre-fills the rest
  4. writes  flags/<code>.svg   (the flag itself, drawn under the player's colours)
            flags/<code>.bin   (run-length encoded region map, uint16)
            flags/manifest.json (names, region colours, areas)
  and a review image in  tools/preview/<code>.png

Tune PREFILL_THRESHOLD and re-run:  python3 tools/build_flags.py
"""
import json, os, struct, sys, io
import numpy as np
from PIL import Image
from scipy import ndimage
import resvg_py

sys.path.insert(0, os.path.dirname(__file__))
from countries import CODES, NAME_OVERRIDES, STRICT, THRESHOLDS, GROUPS

# ---------------------------------------------------------------- settings
W, H = 800, 600                 # internal canvas size (flag-icons are 4:3)
PREFILL_THRESHOLD = 0.01        # regions this big are always fillable
# Smaller regions (stars, crescents, small suns) stay fillable when they are still
# comfortably clickable AND their colour's small regions together add up to something
# meaningful - so Honduras' five stars are playable but a coat of arms is not.
MIN_CLICKABLE = 0.002           # 0.2% of the flag (~30x30px at 800x600)
MIN_CORE_PX = 5                 # must survive a 5px erosion (compact shape, not a thin line)
GROUP_THRESHOLD = 0.008         # combined area of a colour's small clickable regions
MAX_DETAIL_CONTACT = 0.40       # small regions bordered mostly by pre-filled detail are part of an emblem
MIN_PALETTE_SHARE = 0.0005      # colours rarer than this are folded into the nearest colour
NEAR_IDENTICAL = 4              # max per-channel difference for two colours to count as the same
SLIVER_MAX = 0.002              # hairline rendering artefacts below this size get absorbed
SRC = os.environ.get("FLAG_SRC", os.path.join(os.path.dirname(__file__), "..", "work", "package"))
OUT = os.path.join(os.path.dirname(__file__), "..", "flags")
PREVIEW = os.path.join(os.path.dirname(__file__), "preview")
os.makedirs(OUT, exist_ok=True); os.makedirs(PREVIEW, exist_ok=True)


def render(svg_path):
    png = resvg_py.svg_to_bytes(svg_path=svg_path, width=W, height=H,
                                shape_rendering="optimize_speed",
                                text_rendering="optimize_speed")
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    return np.asarray(img).copy()


def quantise(rgba):
    """Return (index_map, palette) where index_map[y,x] is the palette index of
    each pixel. Transparent pixels get index -1."""
    alpha = rgba[..., 3]
    rgb = rgba[..., :3].astype(np.int64)
    key = (rgb[..., 0] << 16) | (rgb[..., 1] << 8) | rgb[..., 2]
    key[alpha < 128] = -1
    vals, counts = np.unique(key, return_counts=True)
    total = W * H
    keep = [(v, c) for v, c in zip(vals, counts) if v >= 0 and c >= MIN_PALETTE_SHARE * total]
    rare = [v for v, c in zip(vals, counts) if v >= 0 and c < MIN_PALETTE_SHARE * total]
    keep.sort(key=lambda t: -t[1])
    # merge colours that are perceptually identical (e.g. #000 and #000001)
    merged = []
    alias = {}
    for v, c in keep:
        rgb = np.array([(v >> 16) & 255, (v >> 8) & 255, v & 255])
        hit = next((i for i, (mv, _) in enumerate(merged)
                    if np.abs(rgb - np.array([(mv >> 16) & 255, (mv >> 8) & 255, mv & 255])).max() <= NEAR_IDENTICAL), None)
        if hit is None: merged.append((v, c))
        else: alias[v] = hit
    keep = merged
    palette = np.array([[(v >> 16) & 255, (v >> 8) & 255, v & 255] for v, _ in keep], dtype=np.int64)
    lut = {v: i for i, (v, _) in enumerate(keep)}
    lut.update(alias)
    # fold rare colours (gradients, odd slivers) into the nearest palette colour
    for v in rare:
        c = np.array([(v >> 16) & 255, (v >> 8) & 255, v & 255])
        d = ((palette - c) ** 2).sum(axis=1)
        lut[int(v)] = int(d.argmin())
    idx = np.full(key.shape, -1, dtype=np.int32)
    for v, i in lut.items():
        idx[key == v] = i
    return idx, palette


def find_regions(idx, palette, threshold=PREFILL_THRESHOLD, strict=False):
    """Label every contiguous same-colour block. Returns label map (0 = pre-filled)
    and a list of fillable regions."""
    total = W * H
    labels = np.zeros(idx.shape, dtype=np.uint16)
    sliver = np.zeros(idx.shape, dtype=bool)     # 1px-wide rendering slivers to absorb
    regions = []
    next_id = 1
    prefilled_px = 0
    # pass 1: collect every region, decide what is fillable
    candidates = []            # (ci, mask, area)
    for ci in range(len(palette)):
        mask = idx == ci
        lab, n = ndimage.label(mask)            # 4-connectivity by default
        if n == 0:
            continue
        sizes = ndimage.sum(mask, lab, index=np.arange(1, n + 1))
        for r in range(1, n + 1):
            area = sizes[r - 1] / total
            rm = lab == r
            if area >= threshold:
                candidates.append((ci, rm, area, "big"))
            elif not strict and area >= MIN_CLICKABLE and ndimage.binary_erosion(rm, iterations=MIN_CORE_PX).any():
                candidates.append((ci, rm, area, "small"))
            elif area < SLIVER_MAX and not ndimage.binary_erosion(rm).any():
                sliver |= rm                    # hairline artefact, not a real detail
            else:
                prefilled_px += sizes[r - 1]
    # small regions are only kept when their colour's small regions add up
    # ...and only when they sit directly on a big region (stars on a field), not
    # buried inside an emblem where their neighbours are all pre-filled detail
    bigmask = np.zeros(idx.shape, dtype=bool)
    candmask = np.zeros(idx.shape, dtype=bool)
    for ci, rm, area, kind in candidates:
        candmask |= rm
        if kind == "big": bigmask |= rm
    detail = ~candmask & ~sliver           # pre-filled detail (emblem lines, lettering...)
    kept = []
    small_total = {}
    for ci, rm, area, kind in candidates:
        if kind == "big":
            on_field = True
        else:
            ring = ndimage.binary_dilation(rm, iterations=2) & ~rm
            touching_detail = (ring & detail).sum() / max(1, ring.sum())
            on_field = (ring & bigmask).any() and touching_detail <= MAX_DETAIL_CONTACT
        kept.append(on_field)
        if kind == "small" and on_field:
            small_total[ci] = small_total.get(ci, 0) + area
    # a set of matching shapes (ten stars) is kept or dropped together
    kept_sizes = {}
    for (ci, rm, area, kind), on_field in zip(candidates, kept):
        if kind == "small" and on_field: kept_sizes.setdefault(ci, []).append(area)
    for i, (ci, rm, area, kind) in enumerate(candidates):
        if kind == "small" and not kept[i] and any(abs(area - a) / a < 0.25 for a in kept_sizes.get(ci, [])):
            kept[i] = True; small_total[ci] = small_total.get(ci, 0) + area
    for (ci, rm, area, kind), on_field in zip(candidates, kept):
        if kind == "small" and (not on_field or small_total.get(ci, 0) < GROUP_THRESHOLD):
            prefilled_px += int(rm.sum()); continue
        labels[rm] = next_id
        cy, cx = ndimage.center_of_mass(rm)
        regions.append({
            "id": next_id,
            "hex": "#%02x%02x%02x" % tuple(int(v) for v in palette[ci]),
            "area": round(float(area), 5),
            "cx": int(cx), "cy": int(cy),
        })
        next_id += 1
    # slivers take the label of the nearest non-sliver pixel
    if sliver.any():
        _, (iy, ix) = ndimage.distance_transform_edt(sliver, return_indices=True)
        labels[sliver] = labels[iy[sliver], ix[sliver]]
        prefilled_px += int((labels[sliver] == 0).sum())
    return labels, regions, prefilled_px / total


def apply_groups(labels, idx, palette, groups, threshold):
    """Hand-tuned grouping from countries.GROUPS (see the comments there)."""
    total = W * H
    for g in groups:
        want = np.array(b_hex(g["hex"]))
        ci = int(((palette - want) ** 2).sum(axis=1).argmin())
        lab, n = ndimage.label(idx == ci)
        sizes = ndimage.sum(idx == ci, lab, index=np.arange(1, n + 1))
        objs = ndimage.find_objects(lab)
        chosen = []
        for r in range(1, n + 1):
            area = sizes[r - 1] / total
            sl = objs[r - 1]
            if g.get("minor") and area >= threshold: continue
            if g.get("major") and area < threshold: continue
            if g.get("boxes"):
                x0, x1 = sl[1].start / W, sl[1].stop / W
                y0, y1 = sl[0].start / H, sl[0].stop / H
                if not any(bx0 <= x0 and x1 <= bx1 and by0 <= y0 and y1 <= by1 for bx0, by0, bx1, by1 in g["boxes"]):
                    continue
            chosen.append(r)
        if g.get("points"):
            pts = []
            for px, py in g["points"]:
                x, y = int(px * W), int(py * H)
                r = lab[y, x]
                if r == 0:                      # nearest piece of that colour to the point
                    ys, xs = np.nonzero(lab)
                    k = ((xs - x) ** 2 + (ys - y) ** 2).argmin()
                    r = lab[ys[k], xs[k]]
                pts.append(r)
            chosen = [r for r in chosen if r in pts]
        if g.get("small"):
            chosen = [r for r in chosen if (labels[lab == r] == 0).all()]
        if not chosen:
            print("   (group matched nothing:", g, ")"); continue
        into = g.get("into")
        if into is None:
            new_id = int(labels.max()) + 1
            for r in chosen: labels[lab == r] = new_id
        elif into == "nearest":
            same = (labels > 0) & (idx == ci)
            for r in chosen: same &= ~(lab == r)
            if not same.any(): continue
            _, (iy, ix) = ndimage.distance_transform_edt(~same, return_indices=True)
            for r in chosen:
                m = lab == r
                cy, cx = [int(v) for v in ndimage.center_of_mass(m)]
                labels[m] = labels[iy[cy, cx], ix[cy, cx]]
        else:
            target = labels[int(into[1] * H), int(into[0] * W)]
            if target == 0:
                print("   (group target point is not on a fillable region:", g, ")"); continue
            for r in chosen: labels[lab == r] = target
    return labels


def b_hex(h):
    h = h.lstrip("#"); return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def rebuild_regions(labels, idx, palette):
    """Recompute the region list from the (possibly regrouped) label map."""
    total = W * H
    regions = []
    ids = [i for i in np.unique(labels) if i > 0]
    remap = {old: new for new, old in enumerate(ids, start=1)}
    out = np.zeros_like(labels)
    for old, new in remap.items():
        m = labels == old
        out[m] = new
        ci = np.bincount(idx[m][idx[m] >= 0]).argmax()
        cy, cx = ndimage.center_of_mass(m)
        regions.append({"id": new, "hex": "#%02x%02x%02x" % tuple(int(v) for v in palette[ci]),
                        "area": round(float(m.sum() / total), 5), "cx": int(cx), "cy": int(cy),
                        "pieces": int(ndimage.label(m)[1])})
    return out, regions


def rle_encode(labels):
    flat = labels.ravel()
    change = np.flatnonzero(np.diff(flat)) + 1
    starts = np.concatenate([[0], change])
    ends = np.concatenate([change, [flat.size]])
    values = flat[starts]
    lengths = ends - starts
    pairs = []
    for v, l in zip(values, lengths):
        while l > 65535:                       # split very long runs
            pairs.append((int(v), 65535)); l -= 65535
        pairs.append((int(v), int(l)))
    out = bytearray(struct.pack("<HHI", W, H, len(pairs)))
    for v, l in pairs:
        out += struct.pack("<HH", v, l)
    return bytes(out)


def preview_image(rgba, labels, regions):
    """Colouring-book view: pre-filled bits in true colour, fillable blank, outlines."""
    out = rgba[..., :3].copy()
    out[rgba[..., 3] < 128] = 120
    out[labels > 0] = 255
    edge = np.zeros(labels.shape, dtype=bool)
    edge[:, :-1] |= labels[:, :-1] != labels[:, 1:]
    edge[:-1, :] |= labels[:-1, :] != labels[1:, :]
    edge = ndimage.binary_dilation(edge, iterations=1)
    out[edge] = 30
    return Image.fromarray(out.astype(np.uint8))


def main():
    countries = {c["code"]: c for c in json.load(open(os.path.join(SRC, "country.json")))}
    manifest = []
    report = []
    for code in CODES:
        svg_path = os.path.join(SRC, "flags", "4x3", f"{code}.svg")
        if not os.path.exists(svg_path):
            print("MISSING", code); continue
        name = NAME_OVERRIDES.get(code) or countries.get(code, {}).get("name") or code.upper()
        rgba = render(svg_path)
        idx, palette = quantise(rgba)
        labels, regions, prefilled = find_regions(idx, palette, THRESHOLDS.get(code, PREFILL_THRESHOLD), code in STRICT)
        if code in GROUPS:
            labels = apply_groups(labels, idx, palette, GROUPS[code], THRESHOLDS.get(code, PREFILL_THRESHOLD))
            labels, regions = rebuild_regions(labels, idx, palette)
            prefilled = float(((labels == 0) & (rgba[..., 3] >= 128)).sum() / (W * H))
        if not regions:
            print("NO FILLABLE REGIONS", code, name); continue
        with open(os.path.join(OUT, f"{code}.bin"), "wb") as f:
            f.write(rle_encode(labels))
        with open(svg_path, "rb") as s, open(os.path.join(OUT, f"{code}.svg"), "wb") as d:
            d.write(s.read())
        preview_image(rgba, labels, regions).save(os.path.join(PREVIEW, f"{code}.png"))
        colours = sorted({r["hex"] for r in regions})
        manifest.append({"code": code, "name": name, "regions": regions,
                         "prefilled": round(prefilled, 4)})
        report.append((code, name, len(regions), len(colours), prefilled))
        print(f"{code}  {name:32s} regions={len(regions):3d} colours={len(colours)} prefilled={prefilled*100:5.1f}%")
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump({"width": W, "height": H, "threshold": PREFILL_THRESHOLD, "flags": manifest}, f, separators=(",", ":"))
    print(f"\n{len(manifest)} flags written to {os.path.abspath(OUT)}")


if __name__ == "__main__":
    main()
