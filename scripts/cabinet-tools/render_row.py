"""Render shelves the way the app draws them: real r2 background at device px, official glass + liquid layers per bottle type x colour,
liquid window from the surface row down, the 1px surface line (skipped inside the label band, at 0% and at 100%).
Used by synth_test.py (known truth) and by measure_shot.py (the expected image that the same detector runs on)."""
import os
import numpy as np
from PIL import Image
from applogic import AppLogic

SCREEN_PT, DPR = 440, 3          # iPhone 17 Pro Max simulator: 440pt @3x = 1320px


class Renderer:
    def __init__(self, app=None, assets=None, screen_pt=SCREEN_PT, dpr=DPR):
        self.app = app or AppLogic()
        self.assets = assets or os.path.join(self.app.repo, 'assets')
        self.screen_pt, self.dpr = screen_pt, dpr
        self.s_pt = screen_pt / self.app.CABINET_PHOTO['sourceWidth']          # source px -> pt
        self._cache = {}
        bg = os.path.join(self.assets, self.app.CABINET_PHOTO['background'])
        if not os.path.isfile(bg):
            raise FileNotFoundError('background not found: %s' % bg)
        self.bg_src = Image.open(bg).convert('RGB')

    def px(self, pt):
        return int(round(pt * self.dpr))      # Yoga snaps every edge to the device pixel grid

    def layer(self, rel, w, h):
        key = (rel, w, h)
        if key not in self._cache:
            p = os.path.join(self.assets, rel)
            if not os.path.isfile(p):
                raise FileNotFoundError('layer not found: %s' % p)
            self._cache[key] = Image.open(p).convert('RGBA').resize((w, h), Image.LANCZOS)
        return self._cache[key]

    def glass(self, type_name, w, h):
        return self.layer(self.app.BOTTLES[type_name]['glass'], w, h)

    def liquid(self, type_name, colour, w, h):
        return self.layer(self.app.liquid_layer(type_name, colour), w, h)

    def wall(self):
        W = self.screen_pt * self.dpr
        H = self.px(self.app.CABINET_PHOTO['sourceHeight'] * self.s_pt)
        return self.bg_src.resize((W, H), Image.LANCZOS).convert('RGBA')

    def bottle_box(self, placed, shelf_index):
        """device-px box of a placed bottle, the way Yoga snaps it"""
        b = self.app.BOTTLES[placed['type']]
        shelf_top = self.app.CABINET_PHOTO['shelfTopY'][shelf_index]
        left_pt, top_pt = placed['xSrc'] * self.s_pt, (shelf_top - placed['heightSrc']) * self.s_pt
        h_pt = placed['heightSrc'] * self.s_pt
        w_pt = h_pt * b['aspect']
        x0, x1, y0, y1 = self.px(left_pt), self.px(left_pt + w_pt), self.px(top_pt), self.px(top_pt + h_pt)
        return dict(x0=x0, x1=x1, y0=y0, y1=y1, w=x1 - x0, h=y1 - y0, top_pt=top_pt, h_pt=h_pt, w_pt=w_pt)

    def bottle_image(self, type_name, colour, w, h, level, line):
        """RGBA image of one bottle: glass, liquid from row `level` down (None = empty), optional surface line at `level`"""
        out = self.glass(type_name, w, h).copy()
        if level is not None:
            l = self.liquid(type_name, colour, w, h)
            out.alpha_composite(l.crop((0, level, w, h)), (0, level))
            if line:
                inset = self.px((w / self.dpr) * self.app.LINE_INSET_FRAC)
                a = np.asarray(l)[level, :, 3].astype(float) / 255 * self.app.LINE_ALPHA
                a[:inset] = 0
                a[w - inset:] = 0
                row = np.zeros((1, w, 4), np.uint8)
                row[0, :, :3] = self.app.LINE_RGB
                row[0, :, 3] = np.round(a * 255)
                out.alpha_composite(Image.fromarray(row, 'RGBA'), (0, level))
        return out

    def draw_bottle(self, canvas, placed, shelf_index):
        box = self.bottle_box(placed, shelf_index)
        pct = max(0.0, min(100.0, float(placed['unit']['pct'])))
        level, line = None, False
        if pct > 0:
            level = self.px(box['top_pt'] + box['h_pt'] * self.app.liquid_frac(placed['type'], pct)) - box['y0']
            line = self.app.line_expected(placed['type'], pct)
        img = self.bottle_image(placed['type'], placed['layer_colour'], box['w'], box['h'], level, line)
        canvas.alpha_composite(img, (box['x0'], box['y0']))
        box.update(type=placed['type'], colour=placed['layer_colour'], colour_rule=placed['colour'], pct=pct, level_y=None if level is None else box['y0'] + level, line=line,
                   bottleId=placed['unit']['bottleId'])
        return box

    def draw_shelves(self, canvas, shelves, presorted=False):
        """shelves: {shelf_index: [unit, ...]} -> list of boxes (sorted by shelf, then x)"""
        boxes = []
        for shelf_index in sorted(shelves):
            placed, last, overflow = self.app.place_row(shelves[shelf_index], shelf_index, presorted=presorted)
            for p in placed:
                bx = self.draw_bottle(canvas, p, shelf_index)
                bx['shelf'] = shelf_index
                boxes.append(bx)
            if overflow:
                boxes.append(dict(shelf=shelf_index, overflow=overflow, last_right_src=last))
        return boxes
