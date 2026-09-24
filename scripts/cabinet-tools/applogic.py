"""Mirror of the frontend placement logic (cabinetTokens.ts + PhotoCabinet.tsx + PhotoBottle.tsx + lib/cabinet.ts), in source px.
Stage 4(二): six bottle types x four liquid colours, all six shelves.
The numbers are parsed from the frontend TS files themselves (default: the repo this tool lives in), so the mirror cannot drift
from the app. Anything the parser cannot find raises immediately; nothing is guessed."""
import os
import re
import json

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REPO = os.path.abspath(os.path.join(HERE, '..', '..'))   # scripts/cabinet-tools -> repo root


def _read(repo, rel):
    p = os.path.join(repo, rel)
    if not os.path.isfile(p):
        raise FileNotFoundError('frontend file not found: %s (repo=%s)' % (rel, repo))
    with open(p, 'r', encoding='utf-8') as f:
        return f.read()


def _num(text, name, where):
    m = re.search(r'\b%s:\s*(-?[0-9.]+|null)\s*,' % re.escape(name), text)
    if not m:
        raise ValueError('cannot find `%s` in %s' % (name, where))
    return None if m.group(1) == 'null' else float(m.group(1))


def _const(text, name, where):
    m = re.search(r'^const %s = (-?[0-9.]+)$' % re.escape(name), text, re.M)
    if not m:
        raise ValueError('cannot find `const %s` in %s' % (name, where))
    return float(m.group(1))


def _int_list(text, name, where):
    m = re.search(r'\b%s(?::[^=\n]*)?\s*[:=]\s*\[([0-9,\s]+)\]' % re.escape(name), text)
    if not m:
        raise ValueError('cannot find `%s: [...]` / `%s = [...]` in %s' % (name, name, where))
    return [int(x) for x in m.group(1).replace(' ', '').split(',') if x]


def _kv_table(text, name, where, key_pattern=r"[A-Za-z0-9_']+", val_pattern=r"'([a-z_0-9]+)'"):
    """`const NAME: ... = { k: 'v', ... }`  ->  dict"""
    m = re.search(r'const %s(?::[^=\n]*)? = \{\n(.*?)\n\}' % re.escape(name), text, re.S)
    if not m:
        raise ValueError('cannot find table `%s` in %s' % (name, where))
    out = {}
    for line in m.group(1).splitlines():
        line = line.split('//', 1)[0].strip()
        for pair in [x.strip() for x in line.split(',') if x.strip()]:
            km = re.match(r"^(%s):\s*%s$" % (key_pattern, val_pattern), pair)
            if not km:
                raise ValueError('cannot parse entry in `%s`: %r' % (name, pair))
            out[km.group(1).strip("'")] = km.group(2)
    return out


class AppLogic:
    def __init__(self, repo=None):
        self.repo = repo or DEFAULT_REPO
        tok = _read(self.repo, 'constants/cabinetTokens.ts')
        cab = _read(self.repo, 'components/cabinet/PhotoCabinet.tsx')
        bot = _read(self.repo, 'components/cabinet/PhotoBottle.tsx')
        lib = _read(self.repo, 'lib/cabinet.ts')

        # ── background tokens ──
        m = re.search(r'export const CABINET_PHOTO = \{(.*?)\n\} as const', tok, re.S)
        if not m:
            raise ValueError('cannot find CABINET_PHOTO in cabinetTokens.ts')
        cp = m.group(1)
        bgm = re.search(r"background: require\('@/assets/(.*?)'\)", cp)
        self.CABINET_PHOTO = dict(
            background=bgm.group(1) if bgm else None,
            sourceWidth=int(_num(cp, 'sourceWidth', 'CABINET_PHOTO')), sourceHeight=int(_num(cp, 'sourceHeight', 'CABINET_PHOTO')),
            shelfTopY=_int_list(cp, 'shelfTopY', 'CABINET_PHOTO'),
            shelfLeftX=int(_num(cp, 'shelfLeftX', 'CABINET_PHOTO')), shelfRightX=int(_num(cp, 'shelfRightX', 'CABINET_PHOTO')),
            shelfFaceHeight=int(_num(cp, 'shelfFaceHeight', 'CABINET_PHOTO')), shelfUndersideHeight=int(_num(cp, 'shelfUndersideHeight', 'CABINET_PHOTO')))
        self.PITCHES = [b - a for a, b in zip(self.CABINET_PHOTO['shelfTopY'], self.CABINET_PHOTO['shelfTopY'][1:])]
        self.MAX_BOTTLE_SRC = min(self.PITCHES) - self.CABINET_PHOTO['shelfFaceHeight'] - self.CABINET_PHOTO['shelfUndersideHeight']

        # ── bottle tokens: six types x colours ──
        m = re.search(r'export const CABINET_PHOTO_BOTTLES[^\n]*= \{\n(.*?)\n\}\n', tok, re.S)
        if not m:
            raise ValueError('cannot find CABINET_PHOTO_BOTTLES in cabinetTokens.ts')
        self.BOTTLES = {}
        for bm in re.finditer(r'^  (\w+): \{\n(.*?)\n  \},$', m.group(1), re.S | re.M):
            name, block = bm.group(1), bm.group(2)
            gm = re.search(r"glass: require\('@/assets/(.*?)'\)", block)
            hm = re.search(r"halo: require\('@/assets/(.*?)'\)", block)
            liquids = dict(re.findall(r"^      (\w+): require\('@/assets/(.*?)'\),$", block, re.M))
            if not gm or not hm or not liquids or 'amber' not in liquids:
                raise ValueError('bottle %s: glass / halo / liquids not parsed' % name)
            self.BOTTLES[name] = dict(
                glass=gm.group(1), liquids=liquids, halo=hm.group(1), haloWidth=int(_num(block, 'haloWidth', name)), haloHeight=int(_num(block, 'haloHeight', name)),
                sourceWidth=int(_num(block, 'sourceWidth', name)), sourceHeight=int(_num(block, 'sourceHeight', name)),
                aspect=_num(block, 'aspect', name), liquidTopFrac=_num(block, 'liquidTopFrac', name), liquidBaseFrac=_num(block, 'liquidBaseFrac', name),
                labelTopFrac=_num(block, 'labelTopFrac', name), labelBaseFrac=_num(block, 'labelBaseFrac', name), heightSrc=int(_num(block, 'heightSrc', name)))
        if len(self.BOTTLES) != 6:
            raise ValueError('expected 6 bottle types in CABINET_PHOTO_BOTTLES, parsed %d' % len(self.BOTTLES))
        self.COLOURS = re.search(r"PHOTO_LIQUID_COLOURS = \[(.*?)\]", tok).group(1).replace("'", '').replace(' ', '').split(',')
        # ── sign board (Stage 4(三)) ──
        m = re.search(r'export const CABINET_PHOTO_SIGN = \{(.*?)\n\} as const', tok, re.S)
        if not m:
            raise ValueError('cannot find CABINET_PHOTO_SIGN in cabinetTokens.ts')
        sg = m.group(1)
        im = re.search(r"image: require\('@/assets/(.*?)'\)", sg)
        tf = re.search(r'textField: \{ left: ([0-9.]+), right: ([0-9.]+), top: ([0-9.]+), bottom: ([0-9.]+) \}', sg)
        ff = re.search(r"fontFamily: '(\w+)'", sg)
        if not (im and tf and ff):
            raise ValueError('CABINET_PHOTO_SIGN: image / textField / fontFamily not parsed')
        self.SIGN = dict(image=im.group(1), sourceWidth=int(_num(sg, 'sourceWidth', 'SIGN')), sourceHeight=int(_num(sg, 'sourceHeight', 'SIGN')),
                         aspect=_num(sg, 'aspect', 'SIGN'), heightSrc=int(_num(sg, 'heightSrc', 'SIGN')),
                         textField=dict(left=float(tf.group(1)), right=float(tf.group(2)), top=float(tf.group(3)), bottom=float(tf.group(4))), fontFamily=ff.group(1))
        self.SIZE_CLASSES = _int_list(tok, 'PHOTO_SIZE_CLASSES_ML', 'cabinetTokens.ts')
        sm = re.search(r"liquidSurface: '#([0-9A-Fa-f]{6})'", tok)
        self.LINE_RGB = tuple(int(sm.group(1)[i:i + 2], 16) for i in (0, 2, 4)) if sm else (255, 205, 140)

        # ── PhotoBottle constants ──
        self.LINE_ALPHA = _const(bot, 'SURFACE_LINE_OPACITY', 'PhotoBottle.tsx')
        self.LINE_INSET_FRAC = _const(bot, 'SURFACE_LINE_INSET_RATIO', 'PhotoBottle.tsx')
        # low-stock halo (Stage 4(四)): the type's pre-rendered halo layer (make_halo.py), tinted crimsonTint, breathing opacity
        for k in ('LOW_HALO_OPACITY_LOW', 'LOW_HALO_OPACITY_HIGH', 'LOW_HALO_PERIOD_MS'):
            setattr(self, k, _const(bot, k, 'PhotoBottle.tsx'))
        cm = re.search(r"crimsonTint: '#([0-9A-Fa-f]{6})'", tok)
        if not cm:
            raise ValueError('cannot find crimsonTint in cabinetTokens.ts')
        self.HALO_RGB = tuple(int(cm.group(1)[i:i + 2], 16) for i in (0, 2, 4))
        lm = re.search(r'return Math\.round\(Number\(remainingPct\)\) < (\d+)', lib)
        if not lm:
            raise ValueError('cannot find isLowStockPct threshold in lib/cabinet.ts')
        self.LOW_STOCK_BELOW = int(lm.group(1))

        # ── PhotoCabinet constants and tables ──
        for k in ('LABEL_RESERVE_RATIO', 'OVERFLOW_TAG_SRC', 'ROW_INSET_SRC', 'GAP_MIN_SRC', 'GAP_STEP_SRC', 'GAP_STEPS', 'OVERFLOW_GAP_SRC'):
            setattr(self, k, _const(cab, k, 'PhotoCabinet.tsx'))
        self.GAP_STEPS = int(self.GAP_STEPS)
        self.ENABLED_SHELVES = _int_list(cab, 'ENABLED_PHOTO_SHELVES', 'PhotoCabinet.tsx')
        for k in ('SIGN_RIGHT_INSET_SRC', 'SIGN_FONT_RATIO', 'SIGN_LETTER_SPACING_RATIO', 'SIGN_MIN_FONT_SCALE'):
            setattr(self, k, _const(cab, k, 'PhotoCabinet.tsx'))
        self.SIGN_WIDTH_SRC = self.SIGN['heightSrc'] * self.SIGN['aspect']
        self.SIGN_LEFT_SRC = self.CABINET_PHOTO['shelfRightX'] - self.SIGN_RIGHT_INSET_SRC - self.SIGN_WIDTH_SRC
        self.SIGN_NAME = {int(k): v for k, v in _kv_table(cab, 'PHOTO_SHELF_SIGN_NAME', 'PhotoCabinet.tsx', key_pattern=r'\d+', val_pattern=r"'([A-Z]+)'").items()}
        m = re.search(r'const BOTTLE_TYPES_BY_SIZE[^\n]*= \{\n(.*?)\n\}', cab, re.S)
        if not m:
            raise ValueError('cannot find BOTTLE_TYPES_BY_SIZE')
        self.TYPES_BY_SIZE = {}
        for line in m.group(1).splitlines():
            km = re.match(r"^\s*(\d+): \[(.*?)\],$", line)
            if not km:
                raise ValueError('cannot parse BOTTLE_TYPES_BY_SIZE line %r' % line)
            self.TYPES_BY_SIZE[int(km.group(1))] = [x.strip().strip("'") for x in km.group(2).split(',')]
        if sorted(self.TYPES_BY_SIZE) != sorted(self.SIZE_CLASSES):
            raise ValueError('BOTTLE_TYPES_BY_SIZE keys %s != PHOTO_SIZE_CLASSES_ML %s' % (sorted(self.TYPES_BY_SIZE), self.SIZE_CLASSES))
        self.SHELF_COLOUR = {int(k): v for k, v in _kv_table(cab, 'PHOTO_SHELF_LIQUID_COLOUR', 'PhotoCabinet.tsx', key_pattern=r'\d+').items()}
        self.INGREDIENT_COLOUR = _kv_table(cab, 'PHOTO_LIQUID_COLOUR_BY_INGREDIENT', 'PhotoCabinet.tsx')
        for t in {t for ts in self.TYPES_BY_SIZE.values() for t in ts}:
            if t not in self.BOTTLES:
                raise ValueError('BOTTLE_TYPES_BY_SIZE names unknown type %s' % t)
        for c in list(self.SHELF_COLOUR.values()) + list(self.INGREDIENT_COLOUR.values()):
            if c not in self.COLOURS:
                raise ValueError('unknown colour %s' % c)

        # ── lib/cabinet.ts: family -> shelf -> photo shelf index ──
        self.FAMILY_TO_SHELF = _kv_table(lib, 'FAMILY_TO_SHELF', 'lib/cabinet.ts')
        self.PHOTO_SHELF_INDEX = {k: int(v) for k, v in _kv_table(lib, 'PHOTO_SHELF_INDEX', 'lib/cabinet.ts', val_pattern=r'(\d+)').items()}

    # ── mirrors of the TS functions ──
    @staticmethod
    def hash_id(s):
        """djb2 exactly as BottleGlyph.hashId: h = ((h << 5) + h + charCode) | 0 (int32 wrap), then Math.abs"""
        h = 5381
        for ch in s:
            h = ((h << 5) + h + ord(ch)) & 0xFFFFFFFF
            if h >= 0x80000000:
                h -= 0x100000000
        return abs(h)

    def shelf_for(self, family_key):
        f = str(family_key or '').strip().lower()
        if not f:
            return 'others'
        if f in self.FAMILY_TO_SHELF:
            return self.FAMILY_TO_SHELF[f]
        if f.endswith('_liqueur') or f == 'amaro':
            return 'liqueurs'
        return 'others'

    def photo_shelf_index(self, family_key):
        return self.PHOTO_SHELF_INDEX[self.shelf_for(family_key)]

    def size_class(self, total_ml):
        try:
            ml = float(total_ml)
        except (TypeError, ValueError):
            return 750
        if not (ml == ml) or ml <= 0:
            return 750
        nearest = self.SIZE_CLASSES[0]
        for size in self.SIZE_CLASSES:
            if abs(size - ml) < abs(nearest - ml):
                nearest = size
        return nearest

    def type_for(self, unit):
        choices = self.TYPES_BY_SIZE[self.size_class(unit.get('totalMl'))]
        return choices[self.hash_id(unit['bottleId']) % len(choices)]

    def colour_for(self, unit, shelf_index):
        return self.INGREDIENT_COLOUR.get(unit.get('ingredientKey', ''), self.SHELF_COLOUR[shelf_index])

    def liquid_layer(self, type_name, colour):
        liquids = self.BOTTLES[type_name]['liquids']
        return liquids.get(colour, liquids['amber'])

    def is_low(self, pct):
        """isLowStockPct mirror: Math.round(pct) < threshold (JS rounds .5 up, Python's round() does not)"""
        import math
        return math.floor(float(pct) + 0.5) < self.LOW_STOCK_BELOW

    def liquid_frac(self, type_name, pct):
        b = self.BOTTLES[type_name]
        c = max(0.0, min(100.0, float(pct)))
        return b['liquidBaseFrac'] - c / 100 * (b['liquidBaseFrac'] - b['liquidTopFrac'])

    def line_expected(self, type_name, pct):
        """PhotoBottle: line iff 0 < pct < 100 and the surface is outside the label band"""
        b = self.BOTTLES[type_name]
        c = max(0.0, min(100.0, float(pct)))
        if not (0 < c < 100):
            return False
        frac = self.liquid_frac(type_name, c)
        if b['labelTopFrac'] is not None and b['labelBaseFrac'] is not None and b['labelTopFrac'] <= frac <= b['labelBaseFrac']:
            return False
        return True

    def fit_row(self, units, limit_src):
        placed, x = [], self.CABINET_PHOTO['shelfLeftX'] + self.ROW_INSET_SRC
        last_right = x
        for u in units:
            t = self.type_for(u)
            h = self.BOTTLES[t]['heightSrc']
            w = h * self.BOTTLES[t]['aspect']
            if x + w > limit_src:
                break
            placed.append(dict(unit=u, type=t, xSrc=x, heightSrc=h, widthSrc=w))
            last_right = x + w
            x = last_right + self.GAP_MIN_SRC + (self.hash_id(u['bottleId']) % self.GAP_STEPS) * self.GAP_STEP_SRC
        return placed, last_right

    def place_row(self, units, shelf_index, presorted=False):
        """units: dicts with bottleId, pct, totalMl, ingredientKey. Returns placed (with type + colour), last_right, overflow.
        The app sorts by pct with a stable sort, so equal-pct bottles keep the order the API returned them in; pass presorted=True
        to supply that order yourself (the measuring tool tries the tie permutations, see measure_shot.match_order)."""
        if not presorted:
            units = sorted(units, key=lambda u: u['pct'])
        width = self.CABINET_PHOTO['shelfRightX'] - self.CABINET_PHOTO['shelfLeftX']
        limit = self.CABINET_PHOTO['shelfRightX'] - width * self.LABEL_RESERVE_RATIO
        placed, last = self.fit_row(units, limit)
        if len(placed) != len(units):
            placed, last = self.fit_row(units, limit - self.OVERFLOW_TAG_SRC)
        for p in placed:
            p['colour'] = self.colour_for(p['unit'], shelf_index)
            p['layer_colour'] = p['colour'] if p['colour'] in self.BOTTLES[p['type']]['liquids'] else 'amber'   # photoLiquidLayer() fallback
        return placed, last, len(units) - len(placed)

    def units_from_truth(self, rows):
        """rows: [{bottleId, ingredient_key, family_key, total_ml, remaining_volume}] -> {shelf_index: [unit]} (bottleUnitsFor mirror)"""
        shelves = {}
        for r in rows:
            total = float(r['total_ml']) if r.get('total_ml') not in (None, '') else 0.0
            pct = (float(r['remaining_volume']) / total) * 100 if total > 0 else 0.0
            unit = dict(bottleId=str(r['bottleId']), ingredientKey=r.get('ingredient_key', ''), pct=pct,
                        totalMl=float(r['total_ml']) if r.get('total_ml') not in (None, '') else None, isLow=self.is_low(pct))
            shelves.setdefault(self.photo_shelf_index(r.get('family_key')), []).append(unit)
        return shelves


if __name__ == '__main__':
    import sys
    app = AppLogic(sys.argv[1] if len(sys.argv) > 1 else None)
    print(json.dumps(dict(repo=app.repo, CABINET_PHOTO=app.CABINET_PHOTO, MAX_BOTTLE_SRC=app.MAX_BOTTLE_SRC, colours=app.COLOURS,
                          size_classes=app.SIZE_CLASSES, types_by_size=app.TYPES_BY_SIZE, enabled_shelves=app.ENABLED_SHELVES,
                          shelf_colour=app.SHELF_COLOUR, ingredient_overrides=len(app.INGREDIENT_COLOUR),
                          bottles={k: {kk: vv for kk, vv in v.items() if kk not in ('glass', 'liquids')} for k, v in app.BOTTLES.items()},
                          gaps=dict(ROW_INSET_SRC=app.ROW_INSET_SRC, GAP_MIN_SRC=app.GAP_MIN_SRC, GAP_STEP_SRC=app.GAP_STEP_SRC, GAP_STEPS=app.GAP_STEPS),
                          sign=dict(app.SIGN, leftSrc=app.SIGN_LEFT_SRC, widthSrc=round(app.SIGN_WIDTH_SRC, 2), names=app.SIGN_NAME, rightInset=app.SIGN_RIGHT_INSET_SRC),
                          line=dict(rgb=app.LINE_RGB, alpha=app.LINE_ALPHA, inset=app.LINE_INSET_FRAC),
                          low_halo=dict(rgb=app.HALO_RGB, opacity=[app.LOW_HALO_OPACITY_LOW, app.LOW_HALO_OPACITY_HIGH], below_pct=app.LOW_STOCK_BELOW,
                                        layers={k: '%s (%dx%d)' % (v['halo'], v['haloWidth'], v['haloHeight']) for k, v in app.BOTTLES.items()})), indent=1))
