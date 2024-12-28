import { Injectable } from '@nestjs/common';
import { createLogger, format, transports } from 'winston';
const { combine, timestamp, printf } = format;

const myFormat = printf(({ level, message, timestamp, stack_trace }) => {
  return `${timestamp} [${level.toUpperCase()}] SB-BM-Fancy ${stack_trace} - ${message}`;
});

@Injectable()
export class LoggerService {
  private logger = createLogger({
    level: 'info',
    format: combine(timestamp(), myFormat),
    transports: [
      new transports.Console(),
      new transports.File({ filename: 'error.log' }),
    ],
  });

  error(message, stack_trace) {
    this.logger.error({ message, stack_trace });
  }

  info(message, stack_trace) {
    this.logger.info({ message, stack_trace });
  }
}
