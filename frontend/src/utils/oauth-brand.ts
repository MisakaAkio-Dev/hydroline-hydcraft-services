export function resolveProviderIcon(type?: string) {
  switch ((type ?? '').toUpperCase()) {
    case 'MICROSOFT':
      return 'i-logos-microsoft-icon'
    default:
      return 'i-lucide-plug'
  }
}

export function resolveProviderAccent(type?: string) {
  switch ((type ?? '').toUpperCase()) {
    case 'MICROSOFT':
      return 'text-sky-600'
    default:
      return 'text-slate-500'
  }
}
