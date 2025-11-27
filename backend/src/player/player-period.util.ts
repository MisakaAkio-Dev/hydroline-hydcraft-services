export const PLAYER_PERIODS: Record<string, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

export function resolvePlayerPeriodStart(period?: string) {
  const days =
    period && Object.prototype.hasOwnProperty.call(PLAYER_PERIODS, period)
      ? PLAYER_PERIODS[period]
      : PLAYER_PERIODS['30d'];
  if (!days) {
    return undefined;
  }
  if (typeof days !== 'number') {
    return undefined;
  }
  const DAY_MS = 24 * 60 * 60 * 1000;
  return new Date(Date.now() - days * DAY_MS);
}
