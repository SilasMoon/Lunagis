export const START_DATE = new Date('2030-01-01T00:00:00Z');

export const indexToDate = (index: number): Date => {
  const date = new Date(START_DATE.getTime());
  date.setUTCHours(date.getUTCHours() + index);
  return date;
};

export const dateToIndex = (date: Date): number => {
    const hours = (date.getTime() - START_DATE.getTime()) / (1000 * 60 * 60);
    return Math.round(hours);
}

export const indexToDateString = (index: number): string => {
  const date = indexToDate(index);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
};