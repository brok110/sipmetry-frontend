"""Measure a simulator screenshot of My Bar (photo cabinet) by program, all six shelves, six bottle types x four liquid colours.
Method (same as Stage 3, generalised): build the wall the app should have drawn (real r2 background, same scale), find where the
screenshot differs from it = bottles, then register each bottle against renders of the official layers: which type (by shape),
where (x/y within +-4px), which colour and liquid row (by fit), whether the surface line is drawn. The same detector is run on
an expected image drawn from the measured parameters, so detector bias cancels. With --truth (rows from the DB) the expected
placement is computed by the app-logic mirror and compared bottle by bottle.

usage: python3 measure_shot.py SHOT.png [--truth truth.json] [--out report.json] [--png overlay.png] [--repo DIR] [--assets DIR]
truth.json: [{"bottleId": "...", "ingredient_key": "gin", "family_key": "gin", "total_ml": 750, "remaining_volume": 450}, ...]"""
import argparse
import itertools
import json
import os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from applogic import AppLogic
from render_row import Renderer, DPR


def lum(x):
    return 0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2]


class Measurer:
    def __init__(self, app=None, assets=None):
        self.app = app or AppLogic()
        self.r = Renderer(self.app, assets)
        self.CP = self.app.CABINET_PHOTO

    # ── wall ──
    def expected_wall(self, width_px):
        s = width_px / self.CP['sourceWidth']
        img = self.r.bg_src.resize((width_px, int(round(self.CP['sourceHeight'] * s))), Image.LANCZOS)
        return np.asarray(img).astype(float), s

    def find_offset(self, shot, wall, cols, rows, search=400):
        """vertical scroll offset dy such that shot[y] == wall[y - dy]; matched on the row profile of a bottle-free column band"""
        ps = lum(shot[:, cols[0]:cols[1]]).mean(axis=1)
        pw = lum(wall[:, cols[0]:cols[1]]).mean(axis=1)
        best = None
        for dy in range(-search, search + 1):
            ys = np.arange(rows[0], min(rows[1], len(ps)))
            yw = ys - dy
            ok = (yw >= 0) & (yw < len(pw))
            if ok.sum() < 600:
                continue
            err = np.abs(ps[ys[ok]] - pw[yw[ok]]).mean()
            if best is None or err < best[1]:
                best = (dy, err)
        return best

    # ── rendering helpers (float arrays) ──
    def patch(self, wall_patch, type_name, colour, w, h, level, line):
        img = np.asarray(self.r.bottle_image(type_name, colour, w, h, level, line)).astype(float)
        a = img[..., 3:4] / 255
        return wall_patch * (1 - a) + img[..., :3] * a, img[..., 3] / 255

    # ── detection ──
    def detect_boxes(self, img, wall, y_shelf, s_px, thr=22, min_w=20):      # bitters_150 is ~28px wide at 1320px
        cell_h = int(round(self.app.MAX_BOTTLE_SRC * s_px)) + 6
        cell = slice(max(0, y_shelf - cell_h), y_shelf)
        diff = np.abs(img[cell] - wall[cell]).max(axis=2)
        mask = diff > thr
        on = mask.sum(axis=0) >= 6
        on = ndimage.binary_closing(on, structure=np.ones(9))
        lab, n = ndimage.label(on)
        boxes = []
        for k in range(1, n + 1):
            xs = np.where(lab == k)[0]
            if len(xs) < min_w:
                continue
            sub = mask[:, xs.min():xs.max() + 1]
            rows = np.where(sub.sum(axis=1) >= 3)[0]
            if len(rows) == 0:
                continue
            y0, y1 = int(rows.min()) + cell.start, int(rows.max()) + 1 + cell.start
            min_h = 0.8 * min(b['heightSrc'] for b in self.app.BOTTLES.values()) * s_px
            if y1 < y_shelf - 12 or (y1 - y0) < min_h:          # bottles stand on the shelf; a UI overlay hanging into the cell (the gear button) does not
                continue
            boxes.append(dict(x0=int(xs.min()), x1=int(xs.max()) + 1, y0=y0, y1=y1))
        return boxes

    def register(self, shot, wall, box, y_shelf, s_px):
        """which type, where (x0, y0, w, h), which colour, which liquid row, line or not"""
        dpr = self.r.dpr
        box_h = box['y1'] - box['y0']
        cands = []
        for t, b in self.app.BOTTLES.items():
            h_pt = b['heightSrc'] * s_px / dpr
            cands.append((t, h_pt, h_pt * b['aspect'], abs(h_pt * dpr - box_h)))
        near = [c for c in cands if c[3] <= 20] or cands
        best = None
        for t, h_pt, w_pt, _ in near:
            b = self.app.BOTTLES[t]
            for w in (int(np.floor(w_pt * dpr)), int(np.ceil(w_pt * dpr))):
                for h in (int(np.floor(h_pt * dpr)), int(np.ceil(h_pt * dpr))):
                    fixed = np.ones(h, bool)
                    fixed[int(h * b['liquidTopFrac']) - 2:int(h * b['liquidBaseFrac']) + 3] = False   # rows that look the same at any fill
                    for x0 in range(box['x0'] - 4, box['x0'] + 5):
                        for y0 in range(y_shelf - h - 4, y_shelf - h + 5):
                            if y0 < 0 or x0 < 0 or x0 + w > shot.shape[1]:
                                continue
                            exp, a = self.patch(wall[y0:y0 + h, x0:x0 + w], t, 'amber', w, h, None, False)
                            sel = (a > 0.5) & fixed[:, None]
                            if sel.sum() == 0:
                                continue
                            err = np.abs(shot[y0:y0 + h, x0:x0 + w] - exp).mean(axis=2)[sel].mean()
                            if best is None or err < best['pos_err']:
                                best = dict(type=t, x0=x0, y0=y0, w=w, h=h, pos_err=float(err), w_pt=w_pt, h_pt=h_pt)
        t, x0, y0, w, h = best['type'], best['x0'], best['y0'], best['w'], best['h']
        b = self.app.BOTTLES[t]
        wp = wall[y0:y0 + h, x0:x0 + w]
        real = shot[y0:y0 + h, x0:x0 + w]
        lo, hi = int(round(h * b['liquidTopFrac'])) - 3, int(round(h * b['liquidBaseFrac'])) + 3

        def score(colour, L, line):
            exp, a = self.patch(wp, t, colour, w, h, L, line)
            return float(np.abs(real - exp).mean(axis=2)[a > 0.5].mean())

        colours = [c for c in self.app.COLOURS if c in b['liquids']]
        scores = [((None, None, False), score('amber', None, False))]
        for colour in colours:                                   # coarse: every 3rd row, both line options
            for L in range(lo, hi + 1, 3):
                for line in (False, True):
                    scores.append(((colour, L, line), score(colour, L, line)))
        (colour, L, line), e = min(scores, key=lambda x: x[1])
        if L is not None:                                        # refine +-3 rows for the winning colour
            for L2 in range(max(lo, L - 3), min(hi, L + 3) + 1):
                for line2 in (False, True):
                    s2 = score(colour, L2, line2)
                    if s2 < e:
                        (colour, L, line), e = (colour, L2, line2), s2
        best.update(colour=colour, level=L, line=bool(line), fit_err=e)   # 0% shows no liquid layer: colour is None (not observable)
        best['pct'] = 0.0 if L is None else float(np.clip((b['liquidBaseFrac'] - L / h) / (b['liquidBaseFrac'] - b['liquidTopFrac']) * 100, 0, 100))
        return best

    # ── expected placement from truth; equal-pct bottles: the app keeps the API's order (stable sort), which we do not have ──
    def match_order(self, items, units, shelf_index, dy):
        """Try every permutation inside each equal-pct group; keep the order whose expected render agrees best with the measured
        bottles (type, colour, x0, bottom, liquid row, line). Returns (boxes of that order, {'groups': sizes, 'orders': n, 'score': best})."""
        units = sorted(units, key=lambda u: u['pct'])
        groups, i = [], 0
        while i < len(units):
            j = i
            while j < len(units) and abs(units[j]['pct'] - units[i]['pct']) < 1e-9:
                j += 1
            groups.append(list(range(i, j)))
            i = j
        n_orders = 1
        for g in groups:
            n_orders *= max(1, len(range(1, len(g) + 1)) and int(np.prod(range(1, len(g) + 1))))
        if n_orders > 50000:
            perms = [list(range(len(units)))]           # too many; keep the DB order
        else:
            perms = [sum((list(p) for p in combo), []) for combo in itertools.product(*[list(itertools.permutations(g)) for g in groups])]
        best = None
        for perm in perms:
            ordered = [units[k] for k in perm]
            placed, last, overflow = self.app.place_row(ordered, shelf_index, presorted=True)
            boxes = [self.r.bottle_box(p, shelf_index) for p in placed]
            score = 0
            for it, p, bx in zip(items, placed, boxes):
                score += (it['type'] != p['type']) * 10 + (it['colour'] not in (None, p['layer_colour'])) * 10 + min(abs(it['x0'] - bx['x0']), 50) + min(abs(it['y1'] - (bx['y1'] + dy)), 50)
            score += abs(len(items) - len(placed)) * 100
            if best is None or score < best[0]:
                best = (score, ordered)
        canvas = self.r.wall()
        exp = self.r.draw_shelves(canvas, {shelf_index: best[1]}, presorted=True)
        return exp, dict(groups=[len(g) for g in groups], orders=len(perms), score=best[0])

    # ── the whole screenshot ──
    def measure(self, path, truth_rows=None, out_png=None):
        shot_img = Image.open(path).convert('RGB')
        shot = np.asarray(shot_img).astype(float)
        Wpx, Hpx = shot.shape[1], shot.shape[0]
        dpr = self.r.dpr
        wall0, s_px = self.expected_wall(Wpx)
        top0 = int(round(self.CP['shelfTopY'][0] * s_px))
        dy, off_err = self.find_offset(shot, wall0, cols=(int(Wpx * 0.80), int(Wpx * 0.955)), rows=(top0 + 100, int(round(self.CP['shelfTopY'][-1] * s_px)) + 100))
        wall = np.zeros_like(shot)
        ys = np.arange(Hpx)
        yw = ys - dy
        ok = (yw >= 0) & (yw < wall0.shape[0])
        wall[ys[ok]] = wall0[yw[ok]]
        rep = dict(size=[Wpx, Hpx], dy=dy, offset_err=round(off_err, 2), s_px=s_px, dpr=dpr, shelves=[])
        truth_shelves = self.app.units_from_truth(truth_rows) if truth_rows is not None else {}
        synth = wall.copy()
        for shelf_index in self.app.ENABLED_SHELVES:
            y_shelf = int(round(self.CP['shelfTopY'][shelf_index] * s_px)) + dy
            boxes = self.detect_boxes(shot, wall, y_shelf, s_px)
            regs = [self.register(shot, wall, bx, y_shelf, s_px) for bx in boxes]
            for r in regs:
                exp, _ = self.patch(wall[r['y0']:r['y0'] + r['h'], r['x0']:r['x0'] + r['w']], r['type'], r['colour'], r['w'], r['h'], r['level'], r['line'])
                synth[r['y0']:r['y0'] + r['h'], r['x0']:r['x0'] + r['w']] = exp
            boxes_exp = self.detect_boxes(synth, wall, y_shelf, s_px)
            items = []
            for i, (bx, r) in enumerate(zip(boxes, regs)):
                x0, y0, w, h, t = r['x0'], r['y0'], r['w'], r['h'], r['type']
                b = self.app.BOTTLES[t]
                exp, a = self.patch(wall[y0:y0 + h, x0:x0 + w], t, r['colour'], w, h, r['level'], r['line'])
                real = shot[y0:y0 + h, x0:x0 + w]
                m = a > 0.98
                blur = lambda img: ndimage.gaussian_filter(img, (1.5, 1.5, 0))
                body = slice(y0 + int(h * 0.42), y0 + int(h * 0.50))          # a band of the body just below the shoulder
                inside = lum(shot[body, x0 + int(w * 0.33):x0 + int(w * 0.67)]).mean()
                side = np.mean([lum(shot[body, max(0, x0 - 22):max(1, x0 - 6)]).mean(), lum(shot[body, x0 + w + 6:x0 + w + 22]).mean()])
                frac = None if r['level'] is None else r['level'] / h
                rule_pct = 100.0 if r['pct'] >= 99.5 else (0.0 if r['pct'] <= 0.5 else r['pct'])   # one liquid row is ~0.7%: the app's 100 / 0 come out as 99.x / 0.x
                in_label = (frac is not None and b['labelTopFrac'] is not None and b['labelTopFrac'] <= frac <= b['labelBaseFrac'])
                item = dict(i=i + 1, type=t, colour=r['colour'], x0=x0, x1=x0 + w, y0=y0, y1=y0 + h, w=w, h=h,
                            bottom_vs_shelf=(y0 + h) - y_shelf, pos_err=round(r['pos_err'], 2), fit_err=round(r['fit_err'], 2),
                            level_row=None if r['level'] is None else y0 + r['level'], surface_frac=None if frac is None else round(frac, 4),
                            surface_in_label_band=bool(in_label), line=r['line'], line_expected=self.app.line_expected(t, rule_pct), pct=round(r['pct'], 1),
                            detector_box=bx, detector_box_expected=boxes_exp[i] if i < len(boxes_exp) else None,
                            body_lum=round(float(inside), 1), wall_lum=round(float(side), 1),
                            diff_vs_expected=round(float(np.abs(real - exp).mean(axis=2)[m].mean()), 2) if m.any() else None,
                            diff_vs_expected_blur=round(float(np.abs(blur(real) - blur(exp)).mean(axis=2)[m].mean()), 2) if m.any() else None,
                            lum_vs_expected=round(float(lum(real - exp)[m].mean()), 2) if m.any() else None)
                items.append(item)
            for a_, b_ in zip(items, items[1:]):
                gap_px = b_['x0'] - a_['x1']
                gap_src = gap_px / s_px
                k = (gap_src - self.app.GAP_MIN_SRC) / self.app.GAP_STEP_SRC
                a_.update(gap_px=gap_px, gap_src=round(gap_src, 1), gap_step=round(k, 2), overlap=gap_px < self.app.GAP_MIN_SRC * s_px - 1.5)
            shelf_rep = dict(shelf=shelf_index, y_shelf=y_shelf, bottles=items)
            if truth_rows is not None:
                exp_all, tie_info = self.match_order(items, truth_shelves.get(shelf_index, []), shelf_index, dy)
                exp_list = [e for e in exp_all if 'overflow' not in e]
                overflow = [e for e in exp_all if 'overflow' in e]
                shelf_rep['expected_count'] = len(exp_list)
                shelf_rep['expected_overflow'] = overflow[0]['overflow'] if overflow else 0
                shelf_rep['tie_orders_tried'] = tie_info
                for item, e in zip(items, exp_list):
                    item['truth'] = dict(bottleId=e['bottleId'], type=e['type'], colour=e['colour'], x0=e['x0'], y0=e['y0'] + dy, w=e['w'], h=e['h'],
                                         level_row=None if e['level_y'] is None else e['level_y'] + dy, line=e['line'], pct=round(e['pct'], 1))
                    item['vs_truth'] = dict(type_ok=item['type'] == e['type'], colour_ok=(item['colour'] == e['colour']) or (e['pct'] == 0 and item['colour'] is None),
                                            dx=item['x0'] - e['x0'], dy=item['y1'] - (e['y1'] + dy), dw=item['w'] - e['w'], dh=item['h'] - e['h'],
                                            level_diff=None if (item['level_row'] is None or e['level_y'] is None) else item['level_row'] - (e['level_y'] + dy),
                                            line_ok=item['line'] == e['line'], pct_diff=round(item['pct'] - e['pct'], 1))
            rep['shelves'].append(shelf_rep)
        if out_png:
            vis = shot_img.copy()
            d = ImageDraw.Draw(vis)
            for sh in rep['shelves']:
                d.line([(0, sh['y_shelf']), (Wpx, sh['y_shelf'])], fill=(80, 160, 255), width=1)
                for it in sh['bottles']:
                    d.rectangle([it['x0'], it['y0'], it['x1'] - 1, it['y1'] - 1], outline=(0, 255, 120), width=1)
                    if it['level_row'] is not None:
                        d.line([(it['x0'] - 10, it['level_row']), (it['x0'], it['level_row'])], fill=(255, 60, 60), width=2)
                    d.text((it['x0'], it['y1'] + 2), '%s %s %.0f%%' % (it['type'].split('_')[0], (it['colour'] or '-')[0], it['pct']), fill=(255, 220, 160))
            vis.save(out_png)
        return rep


def summarize(rep, app):
    lines = ['screenshot %dx%d | scroll dy %d (wall match err %.2f) | scale %.4f px per source px' % (rep['size'][0], rep['size'][1], rep['dy'], rep['offset_err'], rep['s_px'])]
    for sh in rep['shelves']:
        bs = sh['bottles']
        lines.append('shelf %d (top row %d): %d bottle(s)%s' % (sh['shelf'], sh['y_shelf'], len(bs), '' if 'expected_count' not in sh else ' | expected %d (+%d) | equal-pct groups %s, %d order(s) tried, best score %s' % (
            sh['expected_count'], sh['expected_overflow'], sh['tie_orders_tried']['groups'], sh['tie_orders_tried']['orders'], sh['tie_orders_tried']['score'])))
        for it in bs:
            s = '  #%d %-13s %-5s x %4d-%4d y %4d-%4d (%3dx%3d) bottom %+d | pct %5.1f%s line %s (app rule %s)%s | pos %.1f fit %.1f | glass %.1f / wall %.1f | vs expected %.1f→%.1f blur' % (
                it['i'], it['type'], it['colour'] or '-', it['x0'], it['x1'], it['y0'], it['y1'], it['w'], it['h'], it['bottom_vs_shelf'], it['pct'],
                ' (in label band)' if it['surface_in_label_band'] else '', 'Y' if it['line'] else 'N', 'Y' if it['line_expected'] else 'N',
                '' if 'gap_px' not in it else ' | gap %dpx = %.1f src = step %.2f%s' % (it['gap_px'], it['gap_src'], it['gap_step'], ' OVERLAP' if it['overlap'] else ''),
                it['pos_err'], it['fit_err'], it['body_lum'], it['wall_lum'], it['diff_vs_expected'] or 0, it['diff_vs_expected_blur'] or 0)
            if 'vs_truth' in it:
                v = it['vs_truth']
                s += ' || truth %s %s pct %.1f: type %s colour %s dx %+d dy %+d dw %+d dh %+d level %s line %s pct %+.1f' % (
                    it['truth']['type'], it['truth']['colour'], it['truth']['pct'], 'OK' if v['type_ok'] else 'MISMATCH', 'OK' if v['colour_ok'] else 'MISMATCH',
                    v['dx'], v['dy'], v['dw'], v['dh'], v['level_diff'], 'OK' if v['line_ok'] else 'MISMATCH', v['pct_diff'])
            lines.append(s)
    return '\n'.join(lines)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('shot')
    ap.add_argument('--truth')
    ap.add_argument('--out')
    ap.add_argument('--png')
    ap.add_argument('--repo')
    ap.add_argument('--assets')
    args = ap.parse_args()
    app = AppLogic(args.repo)
    m = Measurer(app, args.assets)
    truth = None
    if args.truth:
        with open(args.truth, 'r', encoding='utf-8') as f:
            truth = json.load(f)
    rep = m.measure(args.shot, truth, out_png=args.png)
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(rep, f, indent=1, default=str)
    print(summarize(rep, app))
