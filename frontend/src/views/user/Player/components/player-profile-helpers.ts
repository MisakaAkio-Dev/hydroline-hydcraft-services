import type { PlayerSummary } from '@/types/portal'

export function resolveBindingIdentifier(
  binding: PlayerSummary['authmeBindings'][number] | null | undefined,
) {
  if (!binding) return null
  const trimmedRealname = binding.realname?.trim()
  if (trimmedRealname) return trimmedRealname
  const trimmedUsername = binding.username?.trim()
  return trimmedUsername || null
}

export function normalizeComparisonKey(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.toLowerCase() : null
}

export function matchBindingLuckperms(
  binding: PlayerSummary['authmeBindings'][number],
  entry: PlayerSummary['luckperms'][number],
) {
  const bindingUuid = normalizeComparisonKey(binding.uuid)
  const entryUuid = normalizeComparisonKey(entry.uuid)
  if (bindingUuid && entryUuid) {
    return bindingUuid === entryUuid
  }
  const bindingUsername = normalizeComparisonKey(binding.username)
  const entryUsername = normalizeComparisonKey(entry.authmeUsername)
  return Boolean(
    bindingUsername && entryUsername && bindingUsername === entryUsername,
  )
}
