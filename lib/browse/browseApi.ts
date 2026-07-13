// lib/browse/browseApi.ts
// Query builder + fetch helper for GET /browse-recipes.
// The params-object → query-string split exists so the Search Mode B
// filter UI (spirit/style/exclude) extends BrowseQueryParams without
// reworking call sites.

import type { Session } from "@supabase/supabase-js";
import { apiFetchJson } from "@/lib/api";
import type { BrowseItem } from "@/lib/browse/rowEngine";

export type BrowseQueryParams = {
  q?: string;
  limit?: number;
  sort?: "score";
  // Mode B filters: lowercase exact-match on the backend.
  base_spirit?: string;
  style?: string;
  exclude?: string[]; // joined with commas; server caps at 10
};

export type BrowseResponse = {
  total: number;
  items: BrowseItem[];
};

export function buildBrowseQuery(params: BrowseQueryParams): string {
  const parts: string[] = [];
  const q = params.q?.trim();
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (params.limit != null) parts.push(`limit=${encodeURIComponent(String(params.limit))}`);
  if (params.sort) parts.push(`sort=${encodeURIComponent(params.sort)}`);
  if (params.base_spirit) parts.push(`base_spirit=${encodeURIComponent(params.base_spirit)}`);
  if (params.style) parts.push(`style=${encodeURIComponent(params.style)}`);
  if (params.exclude && params.exclude.length > 0)
    parts.push(`exclude=${encodeURIComponent(params.exclude.join(","))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export type SearchSuggestion = {
  label: string;
  type: "recipe" | "spirit" | "ingredient";
  iba_code?: string;
};

export async function fetchSearchSuggestions(
  session: Session | null,
  q: string,
  limit = 8
): Promise<SearchSuggestion[]> {
  const data = await apiFetchJson<{ suggestions?: SearchSuggestion[] }>(
    `/search-suggestions?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`,
    { session }
  );
  return Array.isArray(data?.suggestions) ? data.suggestions : [];
}

export async function fetchBrowseRecipes(
  session: Session | null,
  params: BrowseQueryParams
): Promise<BrowseResponse> {
  const data = await apiFetchJson<Partial<BrowseResponse>>(
    `/browse-recipes${buildBrowseQuery(params)}`,
    { session }
  );
  return {
    total: Number(data?.total ?? 0),
    items: Array.isArray(data?.items) ? (data!.items as BrowseItem[]) : [],
  };
}
