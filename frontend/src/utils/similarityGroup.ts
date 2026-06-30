const DESCRIPTION_STOPWORDS = new Set([
  'DE', 'DEL', 'EL', 'LA', 'LOS', 'LAS', 'UN', 'UNA',
  'Y', 'O', 'E', 'POR', 'PARA', 'CON', 'EN', 'A', 'AL', 'X',
])

export function descriptionToGroupCode(description: string): string {
  const clean = description
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')       // á→a, é→e, ñ→n
    .replace(/[/\\]/g, '')         // 3/4→34, 1/2→12
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const tokens = clean.split(' ').filter(t => t.length >= 2 && !DESCRIPTION_STOPWORDS.has(t))
  return tokens.slice(0, 2).join('-').slice(0, 20)
}

export function buildGroupSuggestions(
  products: Array<{ id: string; similarity_group_code?: string | null }>,
  currentId: string | null,
  generated: string,
): string[] {
  const existingCodes = [
    ...new Set(
      products
        .filter(p => p.similarity_group_code && p.id !== currentId)
        .map(p => p.similarity_group_code!),
    ),
  ].slice(0, 2)
  return [generated, ...existingCodes.filter(c => c !== generated)].filter(Boolean)
}
