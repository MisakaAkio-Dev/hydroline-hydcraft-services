const SITE_TITLE = 'Hydroline'

function normalizePart(part: string | null | undefined) {
  if (!part) return null
  const trimmed = part.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function buildDocumentTitle(...parts: Array<string | null | undefined>) {
  const normalized = parts
    .map((part) => normalizePart(part))
    .filter((part): part is string => Boolean(part))
  if (!normalized.length) {
    return SITE_TITLE
  }
  return [...normalized, SITE_TITLE].join(' - ')
}

export function setDocumentTitle(...parts: Array<string | null | undefined>) {
  document.title = buildDocumentTitle(...parts)
}
