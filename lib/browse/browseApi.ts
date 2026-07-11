// lib/browse/browseApi.ts
// Query builder + fetch helper for GET /browse-recipes.
// The params-object → query-string split exists so the Search Mode B
// filter UI (spirit/style/exclude — next task) can extend BrowseQueryParams
// without reworking call sites.

import type { Session } from "@supabase/supabase-js";
import { apiFetchJson } from "@/lib/api";
import type { BrowseItem } from "@/lib/browse/rowEngine";

export type BrowseQueryParams = {
  q?: string;
  limit?: number;
  sort?: "score";
  // Future filter params (Mode B full): base_spirit, style, exclude[]
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
  return parts.length ? `?${parts.join("&")}` : "";
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
