// lib/browse/rowEngine.ts
// Pure row engine for the V2 category-carousel bartender homepage.
// items[] (from GET /browse-recipes) → rails[]: READY pinned first, three
// seeded-draw middle rails (of five types), WORTH THE HUNT pinned last.
// Same seed + same items → same page. No React, no IO — unit-testable.

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
  // SAFETY-BADGE (2026-08-13): server-sorted facts (egg > nuts > dairy >
  // caffeine > high_proof); optional so pre-badge cached payloads stay valid.
  badges?: string[];
  total_score: number;
};

export type RailKind =
  | "ready"
  | "one_away"
  | "seasonal"
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

const MAX_RAIL_CARDS = 10;
const MIN_BUCKET_ROW = 3; // bucket-style rails need ≥3 items
const MIN_GROUP_WITHIN_REACH = 4; // shelf/style rails need ≥4 within-reach items
const MIDDLE_RAILS_PER_PAGE = 3; // drawn from the five middle rail types
const RAIL_PICK_POOL = 24; // each rail deals 12 from its top-24 by score

// Deterministic PRNG (mulberry32) + seeded Fisher-Yates. Same seed →
// same sequence, so any page render is reproducible in plain node.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function seededPickOne<T>(arr: readonly T[], seed: number): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(mulberry32((seed >>> 0) + 1)() * arr.length)] ?? null;
}

// Seasonal curated rail (row 2.5). Swap title + code set per season —
// content curation only, engine mechanics stay put. 2026 summer: spritz.
export const SEASONAL_RAIL_TITLE = "SUMMER SPRITZ";
export const SEASONAL_CODES = new Set<string>([
  "IBA_AIRMAIL",
  "IBA_AMERICANO",
  "IBA_APEROL_SPRITZ",
  "IBA_BARRACUDA",
  "IBA_BELLINI",
  "IBA_CHAMPAGNE_COCKTAIL",
  "IBA_FRENCH_75",
  "IBA_FRENCH_76",
  "IBA_FRENCH_77",
  "IBA_KIR",
  "IBA_KIR_ROYALE",
  "IBA_MIMOSA",
  "IBA_NEGRONI_SBAGLIATO",
  "DB_OLD_CUBAN",
  "DB_RUSSIAN_SPRING_PUNCH",
  "DB_SPRITZ",
]);

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
  // Shuffle seed (the masthead refreshNonce). Defaults to 0 — the cold-
  // open page is the deterministic seed-0 hand.
  seed?: number;
};

// Page structure: READY claims first (pinned top slot), then the five
// middle rail types are walked in seeded order — each qualifying type
// claims its cards until MIDDLE_RAILS_PER_PAGE rails fill (fewer on a
// thin pool). Walk order doubles as display order. WORTH THE HUNT claims
// last (pinned bottom). Global greedy dedup: each rail claims from the
// not-yet-used pool, so an item appears at most once per page.
export function buildRails(items: BrowseItem[], options: BuildRailsOptions = {}): Rail[] {
  const rails: Rail[] = [];
  if (!Array.isArray(items) || items.length === 0) return rails;

  const rand = mulberry32(((options.seed ?? 0) >>> 0) + 1);
  const used = new Set<string>(options.excludeCodes || []);
  const unused = () => items.filter((i) => !used.has(i.iba_code));

  // Each rail deals MAX_RAIL_CARDS seeded picks from its top
  // RAIL_PICK_POOL by score — faces rotate between taps while staying
  // inside the quality pool.
  const claim = (candidates: BrowseItem[]): BrowseItem[] => {
    const pool = [...candidates].sort(byScoreDesc).slice(0, RAIL_PICK_POOL);
    const take = seededShuffle(pool, rand).slice(0, MAX_RAIL_CARDS);
    for (const item of take) used.add(item.iba_code);
    return take;
  };

  // 1. READY TO MAKE — pinned first.
  const ready = unused().filter((i) => i.bucket === "can_make");
  if (ready.length >= MIN_BUCKET_ROW) {
    rails.push({ key: "ready", kind: "ready", title: "READY TO MAKE", items: claim(ready), dimmed: false });
  }

  // 2. Middle draw — five builders, seeded walk, stop at three rails.
  const middleBuilders: Array<() => Rail | null> = [
    () => {
      const oneAway = unused().filter((i) => i.bucket === "one_away");
      if (oneAway.length < MIN_BUCKET_ROW) return null;
      return { key: "one_away", kind: "one_away", title: "ONE BOTTLE AWAY", items: claim(oneAway), dimmed: false };
    },
    () => {
      const seasonal = unused().filter((i) => SEASONAL_CODES.has(i.iba_code));
      if (seasonal.length < MIN_BUCKET_ROW) return null;
      return { key: "seasonal", kind: "seasonal", title: SEASONAL_RAIL_TITLE, items: claim(seasonal), dimmed: false };
    },
    () => {
      const taste = unused();
      if (taste.length === 0) return null;
      return { key: "taste", kind: "taste", title: "FOR YOUR TASTE", items: claim(taste), dimmed: false };
    },
    () => {
      const shelfPool = unused();
      const shelfReach = shelfPool.filter(
        (i) => i.bucket === "can_make" || i.bucket === "one_away"
      );
      const topSpirit = pickTopGroup(shelfReach, (i) => i.base_spirit, ["none"]);
      if (!topSpirit) return null;
      const shelf = shelfPool.filter((i) => (i.base_spirit || "").trim() === topSpirit);
      return {
        key: `spirit:${topSpirit}`,
        kind: "spirit_shelf",
        title: `YOUR ${humanizeKey(topSpirit).toUpperCase()} SHELF`,
        items: claim(shelf),
        dimmed: false,
      };
    },
    () => {
      const stylePool = unused();
      const styleReach = stylePool.filter(
        (i) => i.bucket === "can_make" || i.bucket === "one_away"
      );
      const styleBasis = styleReach.length > 0 ? styleReach : stylePool;
      const topStyle = pickTopGroup(styleBasis, (i) => i.style);
      if (!topStyle) return null;
      const styled = stylePool.filter((i) => (i.style || "").trim() === topStyle);
      return {
        key: `style:${topStyle}`,
        kind: "style",
        title: STYLE_DISPLAY_NAMES[topStyle] || humanizeKey(topStyle).toUpperCase(),
        items: claim(styled),
        dimmed: false,
      };
    },
  ];
  let drawn = 0;
  for (const build of seededShuffle(middleBuilders, rand)) {
    if (drawn >= MIDDLE_RAILS_PER_PAGE) break;
    const rail = build();
    if (rail) {
      rails.push(rail);
      drawn += 1;
    }
  }

  // 3. WORTH THE HUNT — pinned last.
  const hunt = unused().filter(
    (i) => i.bucket === "two_away" || i.bucket === "not_found"
  );
  if (hunt.length >= MIN_BUCKET_ROW) {
    rails.push({ key: "hunt", kind: "hunt", title: "WORTH THE HUNT", items: claim(hunt), dimmed: true });
  }

  return rails;
}
