export const REWARD_TIME_ZONE = 'America/Moncton';

export function getRewardDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REWARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = type => parts.find(part => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

