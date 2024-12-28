export * from './cachedKeys';
import { format } from 'date-fns';

export function formatToCustomDateString(date: Date): string {
  return format(date, 'MM/dd/yyyy, hh:mm:ss a');
}


export function generatePacketID(): number {
  var min = 100000000;
  var max = 999999999;
  return Math.floor(
    Math.random() * (max - min + 1) + min
  );
}