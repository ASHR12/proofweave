import type { Citation } from "@/types/report";

/**
 * Filters citations by a case-insensitive query matched against the
 * title, publisher, and excerpt shown for each source in the drawer.
 * A blank query returns every citation unchanged.
 */
export function filterCitations(
  citations: Citation[],
  query: string,
): Citation[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return citations;

  return citations.filter((citation) => {
    const haystack = [
      citation.title,
      citation.publisher ?? "",
      citation.excerpt ?? "",
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
