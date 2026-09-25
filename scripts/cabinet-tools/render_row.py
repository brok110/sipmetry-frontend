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

    def sign_box(self, shelf_index):
        """device-px box of the shelf sign, the way Yoga snaps it"""
        shelf_top = self.app.CABINET_PHOTO['shelfTopY'][shelf_index]
        h_pt = self.app.SIGN['heightSrc'] * self.s_pt
        w_pt = h_pt * self.app.SIGN['aspect']
        left_pt, top_pt = self.app.SIGN_LEFT_SRC * self.s_pt, (shelf_top - self.app.SIGN['heightSrc']) * self.s_pt
        x0, x1, y0, y1 = self.px(left_pt), self.px(left_pt + w_pt), self.px(top_pt), self.px(top_pt + h_pt)
        return dict(x0=x0, x1=x1, y0=y0, y1=y1, w=x1 - x0, h=y1 - y0, top_pt=top_pt, h_pt=h_pt, w_pt=w_pt)

    def sign_image(self, w, h):
        return self.layer(self.app.SIGN['image'], w, h)

    def draw_sign(self, canvas, shelf_index, text_font=None):
        """the sign of one shelf; with text_font (a PIL font path) the family name is engraved the way the app does it (for synthetic shots)"""
        box = self.sign_box(shelf_index)
        canvas.alpha_composite(self.sign_image(box['w'], box['h']), (box['x0'], box['y0']))
        if text_font:
            from PIL import ImageDraw, ImageFont
            tf = self.app.SIGN['textField']
            fw, fh = box['w'] * (tf['right'] - tf['left']), box['h'] * (tf['bottom'] - tf['top'])
            cx, cy = box['x0'] + box['w'] * (tf['left'] + tf['right']) / 2, box['y0'] + box['h'] * (tf['top'] + tf['bottom']) / 2
            size = int(round(box['h'] * self.app.SIGN_FONT_RATIO))
            text = self.app.SIGN_NAME[shelf_index]
            def measure(sz):
                f = ImageFont.truetype(text_font, sz)
                sp = sz * self.app.SIGN_LETTER_SPACING_RATIO
                ws = [f.getlength(ch) for ch in text]
                return f, sp, ws, sum(ws) + sp * (len(text) - 1)
            f, sp, ws, total = measure(size)
            if total > fw:                               # adjustsFontSizeToFit
                size = max(int(size * self.app.SIGN_MIN_FONT_SCALE), int(size * fw / total))
                f, sp, ws, total = measure(size)
            x = cx - total / 2
            asc, desc = f.getmetrics()          # PIL draws the line box from y: ascender line at y, baseline at y + asc, bottom at y + asc + desc
            y = cy - (asc + desc) / 2           # centre the line box on the field, as a centred <Text> does; caps then sit ~0.03em low (EB Garamond metrics)
            d = ImageDraw.Draw(canvas, 'RGBA')
            for ch, wch in zip(text, ws):
                d.text((x, y - 1.5), ch, font=f, fill=(255, 236, 205, 153))
                d.text((x, y), ch, font=f, fill=(38, 24, 12, 224))
                x += wch + sp
        box.update(shelf=shelf_index, name=self.app.SIGN_NAME[shelf_index])
        return box

    def empty_label_centre(self, shelf_index):
        """device px centre of the '+ ADD <family>' label of an empty shelf (x: middle of the bottle zone; y: the sign text's centre line)"""
        cp = self.app.CABINET_PHOTO
        limit = cp['shelfRightX'] - (cp['shelfRightX'] - cp['shelfLeftX']) * self.app.LABEL_RESERVE_RATIO
        left = cp['shelfLeftX'] + self.app.ROW_INSET_SRC
        cx = (left + limit) / 2 * self.s_pt * self.dpr
        cy = (cp['shelfTopY'][shelf_index] - self.app.EMPTY_LABEL_CENTRE_ABOVE_SHELF_SRC) * self.s_pt * self.dpr
        return cx, cy

    def draw_empty_label(self, canvas, shelf_index, text_font):
        """for synthetic shots: the empty-shelf label with the app's mono font (assets/fonts/DMMono-Medium.ttf)"""
        from PIL import ImageDraw, ImageFont
        text = self.app.EMPTY_LABEL_PREFIX + self.app.SIGN_NAME[shelf_index]
        f = ImageFont.truetype(text_font, int(round(self.app.EMPTY_LABEL_FONT_SIZE * self.dpr)))
        sp = self.app.EMPTY_LABEL_LETTER_SPACING * self.dpr
        ws = [f.getlength(ch) for ch in text]
        total = sum(ws) + sp * (len(text) - 1)
        cx, cy = self.empty_label_centre(shelf_index)
        asc, desc = f.getmetrics()
        x, y = cx - total / 2, cy - (asc + desc) / 2
        d = ImageDraw.Draw(canvas, 'RGBA')
        rgb = (200, 180, 150)   # OaklandDusk.text.secondary stand-in for the synthetic shot; the tool measures position, not colour
        for ch, w in zip(text, ws):
            d.text((x, y), ch, font=f, fill=rgb + (int(self.app.EMPTY_LABEL_ALPHA * 255),))
            x += w + sp
        return dict(shelf=shelf_index, cx=cx, cy=cy, text=text)

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

    def halo_box(self, type_name, box):
        """the halo layer drawn at bottle size x (halo size / glass size), centred on the bottle — as PhotoBottle.LowHalo does (pt, then snapped)"""
        b = self.app.BOTTLES[type_name]
        w_pt, h_pt = box['w'] / self.dpr, box['h'] / self.dpr
        hw_pt, hh_pt = w_pt * b['haloWidth'] / b['sourceWidth'], h_pt * b['haloHeight'] / b['sourceHeight']
        x0 = self.px(box['x0'] / self.dpr - (hw_pt - w_pt) / 2)
        y0 = self.px(box['y0'] / self.dpr - (hh_pt - h_pt) / 2)
        return dict(x0=x0, y0=y0, w=self.px(x0 / self.dpr + hw_pt) - x0, h=self.px(y0 / self.dpr + hh_pt) - y0)

    def halo_image(self, type_name, hw, hh, opacity):
        """the type's halo layer (white + alpha) tinted crimsonTint at the given opacity"""
        img = self.layer(self.app.BOTTLES[type_name]['halo'], hw, hh)
        arr = np.asarray(img).copy()
        arr[..., :3] = self.app.HALO_RGB
        arr[..., 3] = (arr[..., 3].astype(float) * opacity).clip(0, 255).astype(np.uint8)
        return Image.fromarray(arr, 'RGBA')

    def draw_bottle(self, canvas, placed, shelf_index, halo_opacity=None):
        box = self.bottle_box(placed, shelf_index)
        pct = max(0.0, min(100.0, float(placed['unit']['pct'])))
        is_low = bool(placed['unit'].get('isLow', self.app.is_low(pct)))
        if is_low:
            op = halo_opacity if halo_opacity is not None else (self.app.LOW_HALO_OPACITY_LOW + self.app.LOW_HALO_OPACITY_HIGH) / 2
            hb = self.halo_box(placed['type'], box)
            canvas.alpha_composite(self.halo_image(placed['type'], hb['w'], hb['h'], op), (hb['x0'], hb['y0']))
        level, line = None, False
        if pct > 0:
            level = self.px(box['top_pt'] + box['h_pt'] * self.app.liquid_frac(placed['type'], pct)) - box['y0']
            line = self.app.line_expected(placed['type'], pct)
        img = self.bottle_image(placed['type'], placed['layer_colour'], box['w'], box['h'], level, line)
        canvas.alpha_composite(img, (box['x0'], box['y0']))
        box.update(type=placed['type'], colour=placed['layer_colour'], colour_rule=placed['colour'], pct=pct, is_low=is_low, level_y=None if level is None else box['y0'] + level, line=line,
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
