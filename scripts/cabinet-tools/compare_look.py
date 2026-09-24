"""Print the look comparison from a measure_shot.py report (--out file): per bottle, screenshot vs the expected render of the
official layers (mean abs diff, after 1.5px blur, signed luminance), and the glass vs the wall right beside it.
usage: python3 compare_look.py report.json"""
import json
import sys

rep = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
print('WALL: scroll dy %d, screenshot vs expected wall mean abs diff %.2f levels (bottle-free column band)' % (rep['dy'], rep['offset_err']))
print('BOTTLES: screenshot minus expected render, inside the outline (abs diff -> after 1.5px blur | signed lum) ; glass band vs wall beside it')
for sh in rep['shelves']:
    for it in sh['bottles']:
        ratio = it['body_lum'] / it['wall_lum'] if it['wall_lum'] else float('nan')
        print(' shelf %d #%d %-13s %-5s pct %5.1f: abs %4.1f -> blur %4.1f | lum %+5.2f | glass %5.1f / wall %5.1f = %4.2fx' % (
            sh['shelf'], it['i'], it['type'], it['colour'] or '-', it['pct'], it['diff_vs_expected'] or 0, it['diff_vs_expected_blur'] or 0,
            it['lum_vs_expected'] or 0, it['body_lum'], it['wall_lum'], ratio))
