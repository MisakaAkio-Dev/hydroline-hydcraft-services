const SPECIAL_FOLDER_KEY = 'useravatar';
const SPECIAL_FOLDER_LABEL = '用户头像';

function normalizePath(input: string) {
  return input.replace(/^\/+|\/+$/g, '').toLowerCase();
}

export function formatFolderPathDisplay(path?: string | null): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  const normalized = normalizePath(trimmed);
  if (normalized === SPECIAL_FOLDER_KEY) {
    return SPECIAL_FOLDER_LABEL;
  }
  if (normalized.startsWith(`${SPECIAL_FOLDER_KEY}/`)) {
    const slashIndex = trimmed.indexOf('/');
    const suffix = slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : '';
    return suffix ? `${SPECIAL_FOLDER_LABEL}/${suffix}` : SPECIAL_FOLDER_LABEL;
  }
  return trimmed;
}

export function formatFolderDisplay(
  folder?: { path?: string | null; name?: string | null },
): string {
  if (!folder) {
    return '根目录';
  }
  const pathLabel = formatFolderPathDisplay(folder.path);
  if (pathLabel) {
    return pathLabel;
  }
  const name = folder.name?.trim();
  if (name) {
    const aliasFromName = formatFolderPathDisplay(name);
    return aliasFromName ?? name;
  }
  return '未知目录';
}
