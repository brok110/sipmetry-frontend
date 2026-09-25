cabinet-tools — CABINET-PHOTO measuring tools. Written 2026-09-19 (Stage 3, one bottle type, WHISKEY only), generalised
2026-09-22 (Stage 4(二)): six bottle types x four liquid colours, all six shelves; 2026-09-24 (Stage 4(三)): the shelf signs;
2026-09-24 (Stage 4(四)): the low-stock halo; 2026-09-24 (Stage 4(五)): the empty-shelf label.
Lives in frontend scripts/cabinet-tools/.

applogic.py      mirror of the app's logic in source px — parses the numbers straight out of constants/cabinetTokens.ts,
                 components/cabinet/PhotoCabinet.tsx, components/cabinet/PhotoBottle.tsx and lib/cabinet.ts of the repo it lives in
                 (tokens, size classes, BOTTLE_TYPES_BY_SIZE, shelf / ingredient colour tables, hashId, fitRow / placeRow,
                 liquid fraction, label-band line rule, CABINET_PHOTO_SIGN + the sign's inset / names / font ratios, the low-stock
                 threshold of lib/cabinet.ts and the LOW_HALO_* constants of PhotoBottle.tsx).
                 Nothing is copied by hand; a pattern it cannot find raises.
                 `python3 applogic.py` prints what it parsed.
render_row.py    draws shelves the way the app does: real background at device px, official glass + liquid layers, surface line,
                 the shelf sign (and, for synthetic shots, its engraved name with the app's own font file), the low-stock halo
                 (the type's halo layer tinted crimsonTint, at the middle of the breathing range)
measure_shot.py  measures a simulator screenshot: wall offset, every bottle's type / colour / box / bottom vs shelf / gap step /
                 liquid row / surface line, screenshot vs expected render; every shelf sign's box (dx vs expected, bottom vs shelf)
                 and whether the engraved name sits inside the blank field and centred (ink box; the Q of TEQUILA / LIQUEURS pulls
                 the vertical centre down a few px — that is the letter, not misalignment); per bottle whether a low-stock halo is
                 there (red-minus-blue of the residual around the silhouette; the breathing phase at capture does not matter);
                 for a shelf with no bottles, whether the '+ ADD <family>' label is there and centred (bright ink box in the bottle zone);
                 with --truth (rows from the DB) compares each bottle
                 to the placement the app logic predicts (type by hashId, colour by ingredient, x by gaps, liquid row by pct).
                 Equal-pct bottles: the app's sort is stable (API order) — the tool tries the permutations inside each
                 equal-pct group and reports the best-matching order.
compare_look.py  prints the look comparison from a report json
synth_test.py    validates measure_shot.py on a synthetic screenshot with known truth (six shelves, all types, all colours,
                 label-band cases, 0% / 100%, an overflowing shelf, six signs with engraved names, five low-stock halos incl. the
                 19.4 / 19.6 rounding boundary, one empty shelf with its label (assets/fonts/DMMono-Medium.ttf), scroll, UI overlays,
                 noise). Run this first.

Needs python3 with pillow, numpy, scipy — use /tmp/cabinet-venv (see ROUND_4_BACKLOG.md CABINET-PHOTO 操作備忘).
Defaults: --repo = this repo (two levels up), --assets = <repo>/assets (background + bottles/*.png from the tokens' require paths).
  python3 scripts/cabinet-tools/synth_test.py
  python3 scripts/cabinet-tools/measure_shot.py SHOT.png --truth truth.json --out report.json --png overlay.png
truth.json: [{"bottleId": "...", "ingredient_key": "gin", "family_key": "gin", "total_ml": 750, "remaining_volume": 450}, ...]
  (SQL: user_inventory i left join user_bottles b on b.inventory_id = i.id, coalesce(b.id, i.id) as "bottleId", …)
Screenshots are measured against the wall and the layers only; the +N overflow tag is not detected — check it by eye.
The sign's text is measured as an ink box (dark pixels inside the field), not read: the tool checks position, not spelling.
