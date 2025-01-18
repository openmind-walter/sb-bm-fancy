import { format } from 'date-fns';

export function formatToCustomDateString(date: Date): string {
  return format(date, 'MM/dd/yyyy, hh:mm:ss a');
}


export function getSanitizedRedisUrl(redisUrl: string): string {
  return redisUrl.endsWith('/') ? redisUrl.slice(0, -1) : redisUrl;
}



