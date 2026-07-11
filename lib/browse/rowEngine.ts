// lib/browse/rowEngine.ts
// Pure row engine for the V2 category-carousel bartender homepage.
// items[] (from GET /browse-recipes) → rails[] in fixed priority order.
// No React, no IO — unit-testable in plain node.

export type BrowseBucket = "can_make" | "one_away" | "two_away" | "not_found";

export type BrowseItem = {
  iba_code: string;
  name: string;
  base_spirit: string | null;
  style: string | null;
  glass: string | null;
  image_url: string | null;
  bucket: BrowseBucket;
  missing_count: number;
  missing: string[]; // ingredient keys, capped at 3 by the backend
  total_score: number;
};

export type RailKind =
  | "ready"
  | "one_away"
  | "taste"
  | "spirit_shelf"
  | "style"
  | "hunt";

export type Rail = {
  key: string; // stable identity across refetches (preserves rail scroll state)
  kind: RailKind;
  title: string;
  items: BrowseItem[];
  dimmed: boolean;
};

const MAX_RAIL_CARDS = 12;
const MIN_BUCKET_ROW = 3; // rows 1/2/6 need ≥3 items
const MIN_GROUP_WITHIN_REACH = 4; // rows 4/5 need ≥4 within-reach items

// Provisional display copy for style rails — keep in one const for easy tweaks.
export const STYLE_DISPLAY_NAMES: Record<string, string> = {
  highball: "TALL & REFRESHING",
  citrus_sour: "BRIGHT & CITRUS",
  liqueur_sour: "SILKY SOURS",
  spirit_forward: "SPIRIT FORWARD",
  spirit_and_vermouth: "STIRRED CLASSICS",
  creamy: "RICH & CREAMY",
};

export function humanizeKey(key: string): string {
  return String(key || "").replace(/_/g, " ").trim();
}

function byScoreDesc(a: BrowseItem, b: BrowseItem): number {
  if (b.total_score !== a.total_score) return b.total_score - a.total_score;
  return a.name.localeCompare(b.name); // deterministic tie-break
}

function cap(items: BrowseItem[]): BrowseItem[] {
  return items.slice(0, MAX_RAIL_CARDS);
}

// Among within-reach items (can_make ∪ one_away), find the group key
// (base_spirit or style) with the most items. Ties break alphabetically
// so refetches don't flip the rail. Returns null when no group clears
// the ≥4 threshold. Falsy keys and explicit excludes never win.
function pickTopGroup(
  withinReach: BrowseItem[],
  keyOf: (item: BrowseItem) => string | null,
  excluded: string[] = []
): string | null {
  const counts = new Map<string, number>();
  for (const item of withinReach) {
    const key = (keyOf(item) || "").trim();
    if (!key || excluded.includes(key)) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && key < best)) {
      best = key;
      bestCount = count;
    }
  }
  return bestCount >= MIN_GROUP_WITHIN_REACH ? best : null;
}

export type BuildRailsOptions = {
  // Recipes already on screen elsewhere (e.g. the spotlight pick) — they
  // join the used-set up front so they never reappear in a rail.
  excludeCodes?: string[];
};

// Global greedy dedup by row priority: each row claims its cards from the
// not-yet-used pool (same per-row filters + score sort + cap 12). An item
// appears at most once per page. Row visibility thresholds are evaluated
// AFTER dedup — a row that fails its threshold claims nothing.
export function buildRails(items: BrowseItem[], options: BuildRailsOptions = {}): Rail[] {
  const rails: Rail[] = [];
  if (!Array.isArray(items) || items.length === 0) return rails;

  const used = new Set<string>(options.excludeCodes || []);
  const unused = () => items.filter((i) => !used.has(i.iba_code));

  const claim = (candidates: BrowseItem[]): BrowseItem[] => {
    const take = cap([...candidates].sort(byScoreDesc));
    for (const item of take) used.add(item.iba_code);
    return take;
  };

  // 1. READY TO MAKE
  const ready = unused().filter((i) => i.bucket === "can_make");
  if (ready.length >= MIN_BUCKET_ROW) {
    rails.push({ key: "ready", kind: "ready", title: "READY TO MAKE", items: claim(ready), dimmed: false });
  }

  // 2. ONE BOTTLE AWAY
  const oneAway = unused().filter((i) => i.bucket === "one_away");
  if (oneAway.length >= MIN_BUCKET_ROW) {
    rails.push({ key: "one_away", kind: "one_away", title: "ONE BOTTLE AWAY", items: claim(oneAway), dimmed: false });
  }

  // 3. FOR YOUR TASTE — always shows (whatever the pool still holds)
  const taste = unused();
  if (taste.length > 0) {
    rails.push({ key: "taste", kind: "taste", title: "FOR YOUR TASTE", items: claim(taste), dimmed: false });
  }

  // 4. YOUR {SPIRIT} SHELF — base_spirit="none" excluded from this row type
  const shelfPool = unused();
  const shelfReach = shelfPool.filter(
    (i) => i.bucket === "can_make" || i.bucket === "one_away"
  );
  const topSpirit = pickTopGroup(shelfReach, (i) => i.base_spirit, ["none"]);
  if (topSpirit) {
    const shelf = shelfPool.filter((i) => (i.base_spirit || "").trim() === topSpirit);
    rails.push({
      key: `spirit:${topSpirit}`,
      kind: "spirit_shelf",
      title: `YOUR ${humanizeKey(topSpirit).toUpperCase()} SHELF`,
      items: claim(shelf),
      dimmed: false,
    });
  }

  // 5. {STYLE ROW}
  // Normally picked from within-reach items (≥4 rule), but on a fully cold
  // bar (zero within reach) it falls back to the whole pool: per spec, cold
  // start keeps rows 3/5/6 — the style row is taste-based, unlike the
  // possessive "YOUR X SHELF" which must vanish when nothing is in reach.
  const stylePool = unused();
  const styleReach = stylePool.filter(
    (i) => i.bucket === "can_make" || i.bucket === "one_away"
  );
  const styleBasis = styleReach.length > 0 ? styleReach : stylePool;
  const topStyle = pickTopGroup(styleBasis, (i) => i.style);
  if (topStyle) {
    const styled = stylePool.filter((i) => (i.style || "").trim() === topStyle);
    rails.push({
      key: `style:${topStyle}`,
      kind: "style",
      title: STYLE_DISPLAY_NAMES[topStyle] || humanizeKey(topStyle).toUpperCase(),
      items: claim(styled),
      dimmed: false,
    });
  }

  // 6. WORTH THE HUNT
  const hunt = unused().filter(
    (i) => i.bucket === "two_away" || i.bucket === "not_found"
  );
  if (hunt.length >= MIN_BUCKET_ROW) {
    rails.push({ key: "hunt", kind: "hunt", title: "WORTH THE HUNT", items: claim(hunt), dimmed: true });
  }

  return rails;
}
