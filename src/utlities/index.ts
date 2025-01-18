import { format } from 'date-fns';

export function formatToCustomDateString(date: Date): string {
  return format(date, 'MM/dd/yyyy, hh:mm:ss a');
}


export function getSanitizedRedisUrl(redisUrl: string): string {
  return redisUrl.endsWith('/') ? redisUrl.slice(0, -1) : redisUrl;
}



export function generateGUID(): string {
  return 'xxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}