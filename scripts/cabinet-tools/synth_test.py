"""Validate measure_shot.py on a synthetic screenshot with known truth: all six shelves, all six bottle types, all four colours,
label-band cases, 0% / 100%, an overflowing shelf, a scroll offset, UI overlays and noise. Run this first after any change.
usage: python3 synth_test.py [--repo DIR] [--assets DIR] [--keep /tmp/synth_shot.png]"""
import argparse
import json
import random
import numpy as np
from PIL import Image, ImageDraw
from applogic import AppLogic
from render_row import Renderer
from measure_shot import Measurer, summarize

ap = argparse.ArgumentParser()
ap.add_argument('--repo')
ap.add_argument('--assets')
ap.add_argument('--keep', default='/tmp/synth_shot.png')
ap.add_argument('--font', help='TTF used to engrave the sign names (default: the app font in <repo>/assets/fonts/EBGaramond-SemiBold.ttf)')
args = ap.parse_args()
random.seed(3)
np.random.seed(3)
app = AppLogic(args.repo)
r = Renderer(app, args.assets)


def rid(i):
    return '%02d%06x-7c1e-4b2a-9d3f-%012x' % (i, random.getrandbits(24), random.getrandbits(48))


# truth rows: (ingredient_key, family_key, total_ml, pct) per shelf, chosen to exercise every type and colour
spec = {
    0: [('gin', 'gin', 750, 5.07), ('gin', 'gin', 1000, 60), ('gin', 'gin', 148, 50)],          # 148ml gin -> bitters_150 has no clear layer -> app falls back to amber
    1: [('vodka', 'vodka', 375, 22.4), ('vanilla_vodka', 'vodka', 750, 100), ('vodka', 'vodka', 500, 83.3)],
    2: [('white_rum', 'rum', 750, 41), ('dark_rum', 'rum', 750, 0), ('cachaca', 'cachaca', 1000, 30), ('gold_rum', 'rum', 700, 55), ('aged_rum', 'rum', 118, 90)],
    3: [('bourbon', 'whiskey', 750, 7), ('rye_whiskey', 'whiskey', 750, 19.4), ('scotch_whisky', 'whiskey', 1750, 19.6), ('kirsch', 'brandy', 350, 52), ('cognac', 'brandy', 500, 68), ('whiskey', 'whiskey', 750, 85), ('irish_whiskey', 'whiskey', 750, 100)],   # 19.4 low, 19.6 not (Math.round)
    4: [('tequila_blanco', 'tequila', 750, 50), ('tequila_anejo', 'tequila', 750, 50), ('mezcal', 'mezcal', 1000, 12), ('tequila_reposado', 'tequila', 500, 36)],
    5: [('campari', 'bitter_liqueur', 1000, 45), ('angostura_bitters', 'aromatic_bitters', 118, 60), ('peychaud_s_bitters', 'aromatic_bitters', 148, 95),
        ('coffee_liqueur', 'coffee_liqueur', 750, 50), ('sweet_vermouth', 'vermouth', 750, 20), ('irish_cream', 'cream_liqueur', 750, 33), ('aperol', 'bitter_liqueur', 700, 77),
        ('triple_sec', 'orange_liqueur', 350, 66), ('amaretto', 'nut_liqueur', 750, 90), ('cynar', 'amaro', 1000, 40)],           # 10 -> overflow expected
}
rows = []
i = 0
for shelf, items in spec.items():
    for key, fam, ml, pct in items:
        i += 1
        rows.append(dict(bottleId=rid(i), ingredient_key=key, family_key=fam, total_ml=ml, remaining_volume=ml * pct / 100))
shelves = app.units_from_truth(rows)
wall = r.wall()
import os
font = args.font or os.path.join(app.repo, 'assets', 'fonts', 'EBGaramond-SemiBold.ttf')
sign_truth = [r.draw_sign(wall, i, text_font=font) for i in app.ENABLED_SHELVES]
truth = r.draw_shelves(wall, shelves)
DY = -37                                                     # pretend the wall was scrolled up by 37px
full = Image.new('RGB', (1320, 2868), (7, 6, 14))
full.paste(wall.convert('RGB'), (0, DY))
d = ImageDraw.Draw(full, 'RGBA')
d.rectangle([0, 0, 1320, 520], fill=(7, 6, 14, 150))
d.rectangle([60, 2440, 1260, 2630], fill=(200, 120, 40, 255))
d.rectangle([0, 2650, 1320, 2868], fill=(10, 8, 16, 255))
arr = np.asarray(full).astype(float)
arr += np.random.normal(0, 1.2, arr.shape)
full = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
full.save(args.keep)
with open('/tmp/synth_truth.json', 'w') as f:
    json.dump(rows, f, indent=1)

m = Measurer(app, args.assets)
rep = m.measure(args.keep, rows, out_png='/tmp/synth_overlay.png')
print(summarize(rep, app))
print()
worst = dict(dx=0, dy=0, dw=0, dh=0, level=0, pct=0.0)
n_found = n_truth = 0
type_ok = colour_ok = line_ok = True
for sh in rep['shelves']:
    n_found += len(sh['bottles'])
    n_truth += sh['expected_count']
    for it in sh['bottles']:
        if 'vs_truth' not in it:
            continue
        v = it['vs_truth']
        for k in ('dx', 'dy', 'dw', 'dh'):
            worst[k] = max(worst[k], abs(v[k]))
        if v['level_diff'] is not None:
            worst['level'] = max(worst['level'], abs(v['level_diff']))
        worst['pct'] = max(worst['pct'], abs(v['pct_diff']))
        type_ok &= v['type_ok']
        colour_ok &= v['colour_ok']
        line_ok &= v['line_ok']
print('scroll offset found %d (truth %d) | bottles found %d of %d expected | overflow shelves: %s' % (
    rep['dy'], DY, n_found, n_truth, [(sh['shelf'], sh['expected_overflow']) for sh in rep['shelves'] if sh['expected_overflow']]))
print('all types right: %s | all colours right: %s | all line flags right: %s' % (type_ok, colour_ok, line_ok))
print('worst errors of the tool on known truth:', worst)
signs_ok = True
for sh, st in zip(rep['shelves'], sign_truth):
    sg = sh['sign']; t = sg['text']
    # dy: the ink box of TEQUILA / LIQUEURS includes the tail of the Q below the baseline, which pulls its centre down ~5px at this size
    good = sg['dx'] == 0 and sg['y0'] == st['y0'] + DY and sg['bottom_vs_shelf'] == 0 and t is not None and t['inside_field'] and abs(t['dx_centre']) <= 2.5 and abs(t['dy_centre']) <= (7 if 'Q' in sg['name'] else 3.5)
    signs_ok &= good
    print('sign %d %-8s dx %+d bottom %+d text %s' % (sg['shelf'], sg['name'], sg['dx'], sg['bottom_vs_shelf'], 'missing' if t is None else 'centre %+.1f/%+.1f %s' % (t['dx_centre'], t['dy_centre'], 'inside' if t['inside_field'] else 'OUTSIDE')), '' if good else '<-- BAD')
print('signs: all six at the expected place with the name centred in the field:', signs_ok)
halo_ok = True
n_low = 0
for sh in rep['shelves']:
    for it in sh['bottles']:
        if 'vs_truth' in it:
            n_low += 1 if it['truth']['is_low'] else 0
            halo_ok &= it['vs_truth']['halo_ok']
print('low-stock halos: %d low bottles in truth, every bottle\'s halo present/absent as its isLow: %s' % (n_low, halo_ok))
ok = rep['dy'] == DY and n_found == n_truth and type_ok and colour_ok and line_ok and worst['dx'] == 0 and worst['dy'] == 0 and worst['level'] <= 1 and worst['pct'] <= 1.5 and signs_ok and halo_ok and n_low >= 4
print('SYNTH TEST', 'PASSED' if ok else 'FAILED')
raise SystemExit(0 if ok else 1)
