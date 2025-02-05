import { Competition, EventType } from ".";

export interface FancyMarket {
  providerId: string;
  serviceId: string;
  marketId: string;
  eventId: string;
  eventName?: string;
  bettingType: string;
  eventType?: EventType;
  competition?: Competition;
  topic?: string;
  runners: FancyMarketRunner[];
  updatedAt?: string;
}

export interface FancyMarketRunner {
  selectionId: number;
  runnerName: string;
  priority: number;
  minBetSize: number;
  maxBetSize: number;
  maxMarketVolume: number;
  priceYes: number;
  priceNo: number;
  spreadYes: number;
  spreadNo: number;
  priceResult?: number;
  status: FancyRunnerStaus;
  inPlay: number;
  isActive: number;
  betAllow: number;
  autoSuspendTime: string;
  handicap: number;
  providerId: string;
}





export enum FancyRunnerStaus {
  ACTIVE = "ACTIVE",
  BALL_RUNNING = "BALL_RUNNING",
  CLOSED = "CLOSED",
  SUSPENDED = "SUSPENDED",
  REMOVED = "REMOVED"
}
