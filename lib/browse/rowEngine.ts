// lib/browse/rowEngine.ts
// Pure row engine for the V2 category-carousel bartender homepage.
// items[] (from GET /browse-recipes) → rails[]: two IN SEASON theme rails
// first (this month's headline theme pinned, the month's backups rotating
// second), then READY TO MAKE, ONE BOTTLE AWAY and WORTH THE HUNT pinned in
// that order. The calendar day joins the seed, so every day opens on a new
// hand and a logo tap steps one further. Same seed + same items + same
// date → same page. No React, no IO — unit-testable.
//
// THEME-TAGS Stage 5 (2026-10-07): the five-type middle draw (one_away /
// seasonal / taste / spirit_shelf / style) and the curated SEASONAL_CODES
// list are retired. Themes come from three sources — verified tags the
// backend attaches to every item (`tags`, e.g. "city:paris"), the item's
// base_spirit, and its style — and a per-month program (MONTH_PROGRAM)
// says which themes a month shows. Change the month's themes by editing
// the table; no engine change needed.

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
  // THEME-TAGS Stage 4 (2026-10-06): verified theme tags as "type:value"
  // strings (e.g. "occasion:halloween"); optional so older payloads and
  // the pre-Stage-4 backend still type-check (then no tag theme qualifies).
  tags?: string[];
  total_score: number;
};

export type RailKind = "theme" | "ready" | "one_away" | "hunt";

export type Rail = {
  key: string; // stable identity across refetches (preserves rail scroll state)
  kind: RailKind;
  title: string;
  items: BrowseItem[];
  dimmed: boolean;
};

const MAX_RAIL_CARDS = 10;
const MIN_BUCKET_ROW = 3; // every rail needs ≥3 items
const RAIL_PICK_POOL = 24; // each rail deals 10 from its top-24 by score
const THEME_RAILS_PER_PAGE = 2;

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

// Provisional display copy for style rails — keep in one const for easy tweaks.
// Also the titles of the "style:<value>" themes below.
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

// ── Themes ────────────────────────────────────────────────────────────────
// A theme key is "<source>:<value>":
//   "spirit:<group>"  → item.base_spirit is in SPIRIT_GROUPS[group]
//   "style:<value>"   → item.style === value (title from STYLE_DISPLAY_NAMES)
//   anything else     → item.tags includes the key verbatim ("city:paris",
//                       "era:tiki_era", "occasion:halloween", "vibe:brunch",
//                       "collection:cowboy" …)
export type ThemeKey = string;

export const SPIRIT_GROUPS: Record<string, string[]> = {
  whiskey: ["whiskey"],
  gin: ["gin"],
  rum: ["rum"],
  vodka: ["vodka"],
  agave: ["tequila", "mezcal"],
  brandy: ["brandy"],
};

// Display titles for tag and spirit themes. Content copy only — edit freely.
export const THEME_TITLES: Record<ThemeKey, string> = {
  "occasion:halloween": "HALLOWEEN POURS",
  "occasion:thanksgiving": "THANKSGIVING TABLE",
  "occasion:new_year": "NEW YEAR'S BUBBLES",
  "occasion:valentines": "VALENTINE'S POURS",
  "occasion:st_patricks": "ST. PATRICK'S DAY",
  "occasion:cinco_de_mayo": "CINCO DE MAYO",
  "occasion:summer": "SUMMER SIPS",
  "occasion:winter": "WINTER WARMERS",
  "city:new_york": "NEW YORK CLASSICS",
  "city:paris": "MADE IN PARIS",
  "city:london": "LONDON CALLING",
  "city:new_orleans": "NEW ORLEANS NIGHTS",
  "city:san_francisco": "SAN FRANCISCO",
  "origin:cuba": "CUBAN CLASSICS",
  "origin:italy": "MADE IN ITALY",
  "era:golden_age": "THE GOLDEN AGE",
  "era:prohibition": "PROHIBITION ERA",
  "era:tiki_era": "TIKI ERA",
  "era:disco_era": "DISCO DECADES",
  "era:modern": "MODERN CLASSICS",
  "vibe:tropical": "TROPICAL ESCAPE",
  "vibe:after_dinner": "AFTER DINNER",
  "vibe:aperitivo": "APERITIVO HOUR",
  "vibe:brunch": "BRUNCH POURS",
  "collection:cowboy": "COWBOY CLASSICS",
  "collection:caribbean": "CARIBBEAN CLASSICS",
  "spirit:whiskey": "WHISKEY CLASSICS",
  "spirit:gin": "GIN CLASSICS",
  "spirit:rum": "RUM CLASSICS",
  "spirit:vodka": "VODKA CLASSICS",
  "spirit:agave": "TEQUILA & MEZCAL",
  "spirit:brandy": "BRANDY & COGNAC",
};

function splitThemeKey(key: ThemeKey): [string, string] {
  const i = key.indexOf(":");
  return i < 0 ? [key, ""] : [key.slice(0, i), key.slice(i + 1)];
}

export function themeTitle(key: ThemeKey): string {
  const [source, value] = splitThemeKey(key);
  if (source === "style") return STYLE_DISPLAY_NAMES[value] || humanizeKey(value).toUpperCase();
  return THEME_TITLES[key] || humanizeKey(value).toUpperCase();
}

export function themeMatches(key: ThemeKey, item: BrowseItem): boolean {
  const [source, value] = splitThemeKey(key);
  if (source === "spirit") {
    const spirit = (item.base_spirit || "").trim().toLowerCase();
    return (SPIRIT_GROUPS[value] || []).includes(spirit);
  }
  if (source === "style") return (item.style || "").trim().toLowerCase() === value;
  return Array.isArray(item.tags) && item.tags.includes(key);
}

// ── Month program ─────────────────────────────────────────────────────────
// headline: the month's pinned first rail. special: a date window inside the
// month that takes the headline slot instead (holidays). backups: the second
// rail, one seeded pick per page (the masthead logo tap rotates it). A theme
// that cannot fill ≥3 cards is skipped and the next in line takes its slot.
export type MonthProgram = {
  headline: ThemeKey;
  special?: { key: ThemeKey; fromDay: number; toDay: number };
  backups: ThemeKey[];
};

export const MONTH_PROGRAM: Record<number, MonthProgram> = {
  1: { headline: "occasion:winter", special: { key: "occasion:new_year", fromDay: 1, toDay: 7 }, backups: ["vibe:after_dinner", "spirit:whiskey", "style:spirit_and_vermouth"] },
  2: { headline: "occasion:winter", special: { key: "occasion:valentines", fromDay: 1, toDay: 14 }, backups: ["vibe:after_dinner", "city:paris", "style:creamy"] },
  3: { headline: "vibe:aperitivo", special: { key: "occasion:st_patricks", fromDay: 1, toDay: 17 }, backups: ["spirit:whiskey", "city:london", "style:citrus_sour"] },
  4: { headline: "vibe:brunch", backups: ["spirit:gin", "vibe:aperitivo", "style:spirit_forward"] },
  5: { headline: "vibe:tropical", special: { key: "occasion:cinco_de_mayo", fromDay: 1, toDay: 5 }, backups: ["spirit:agave", "vibe:brunch", "era:disco_era"] },
  6: { headline: "occasion:summer", backups: ["spirit:rum", "collection:caribbean", "spirit:gin"] },
  7: { headline: "occasion:summer", backups: ["vibe:tropical", "city:new_york", "spirit:vodka"] },
  8: { headline: "era:tiki_era", backups: ["style:highball", "spirit:rum", "origin:cuba"] },
  9: { headline: "collection:cowboy", backups: ["spirit:whiskey", "city:new_orleans", "style:liqueur_sour"] },
  10: { headline: "occasion:halloween", backups: ["era:prohibition", "era:disco_era", "style:spirit_forward"] },
  11: { headline: "occasion:thanksgiving", backups: ["collection:cowboy", "spirit:brandy", "occasion:winter"] },
  12: { headline: "occasion:winter", special: { key: "occasion:new_year", fromDay: 26, toDay: 31 }, backups: ["vibe:after_dinner", "style:spirit_and_vermouth", "city:paris"] },
};

// Local calendar day as a running number (days since 1970-01-01 in the
// device's time zone). Added to the seed by buildRails and by the
// spotlight pick, so each day opens on the next hand without any storage.
export function dayIndex(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
}

// Theme keys to try for a page, in order: the headline (or its holiday
// window) first, then the backups starting at the seed's offset — every
// day and every logo tap advances one step, so consecutive hands never
// repeat a theme (a seeded random pick repeated often: mulberry32's first
// draw is nearly the same for neighbouring seeds). The page takes the
// first THEME_RAILS_PER_PAGE that can fill a rail.
export function themesForPage(month: number, day: number, seed: number): ThemeKey[] {
  const program = MONTH_PROGRAM[month];
  if (!program) return [];
  const s = program.special;
  const headline = s && day >= s.fromDay && day <= s.toDay ? s.key : program.headline;
  const backups = program.backups.filter((k) => k !== headline);
  const start = backups.length > 0 ? (seed >>> 0) % backups.length : 0;
  return [headline, ...backups.map((_, i) => backups[(start + i) % backups.length])];
}

function byScoreDesc(a: BrowseItem, b: BrowseItem): number {
  if (b.total_score !== a.total_score) return b.total_score - a.total_score;
  return a.name.localeCompare(b.name); // deterministic tie-break
}

export type BuildRailsOptions = {
  // Recipes already on screen elsewhere (e.g. the spotlight pick) — they
  // join the used-set up front so they never reappear in a rail.
  excludeCodes?: string[];
  // Shuffle seed (the masthead refreshNonce). Defaults to 0. The calendar
  // day of `date` is added to it, so a cold open is deterministic per day.
  seed?: number;
  // The calendar date the page is for (month program + day offset).
  // Defaults to now; pass a fixed date in tests.
  date?: Date;
};

// Page structure: two IN SEASON theme rails (headline pinned, backup
// rotating), then READY TO MAKE, ONE BOTTLE AWAY and WORTH THE HUNT, each
// shown only when it clears MIN_BUCKET_ROW. Global greedy dedup: each rail
// claims from the not-yet-used pool in display order, so an item appears
// at most once per page.
export function buildRails(items: BrowseItem[], options: BuildRailsOptions = {}): Rail[] {
  const rails: Rail[] = [];
  if (!Array.isArray(items) || items.length === 0) return rails;

  const date = options.date ?? new Date();
  const seed = ((options.seed ?? 0) + dayIndex(date)) >>> 0;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const rand = mulberry32(seed + 1);
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

  // 1. IN SEASON — this month's themes, first THEME_RAILS_PER_PAGE that fill.
  let themeRails = 0;
  for (const key of themesForPage(month, day, seed)) {
    if (themeRails >= THEME_RAILS_PER_PAGE) break;
    const matches = unused().filter((i) => themeMatches(key, i));
    if (matches.length < MIN_BUCKET_ROW) continue;
    rails.push({ key: `theme:${key}`, kind: "theme", title: themeTitle(key), items: claim(matches), dimmed: false });
    themeRails += 1;
  }

  // 2. READY TO MAKE
  const ready = unused().filter((i) => i.bucket === "can_make");
  if (ready.length >= MIN_BUCKET_ROW) {
    rails.push({ key: "ready", kind: "ready", title: "READY TO MAKE", items: claim(ready), dimmed: false });
  }

  // 3. ONE BOTTLE AWAY
  const oneAway = unused().filter((i) => i.bucket === "one_away");
  if (oneAway.length >= MIN_BUCKET_ROW) {
    rails.push({ key: "one_away", kind: "one_away", title: "ONE BOTTLE AWAY", items: claim(oneAway), dimmed: false });
  }

  // 4. WORTH THE HUNT — pinned last.
  const hunt = unused().filter(
    (i) => i.bucket === "two_away" || i.bucket === "not_found"
  );
  if (hunt.length >= MIN_BUCKET_ROW) {
    rails.push({ key: "hunt", kind: "hunt", title: "WORTH THE HUNT", items: claim(hunt), dimmed: true });
  }

  return rails;
}
