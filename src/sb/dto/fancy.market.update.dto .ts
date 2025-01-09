export enum MaraketStaus {
    ACTIVE = "ACTIVE",
    BALL_RUNNING = "BALL_RUNNING",
    CLOSED = "CLOSED",
    SUSPENDED = "SUSPENDED",
    REMOVED = "REMOVED"
}

export class FancyMarketUpdateDto {
    fancy_id: string
    auto_suspend_time: string;
    marketId: string;
    eventId: string;
    marketName: string;
    priority: number;
    minBetSize: number;
    maxBetSize: number;
    maxMarketVolume: number;
    priceYes: number;
    priceNo: number;
    spreadYes: number;
    spreadNo: number;
    priceResult?: number;
    status: MaraketStaus;
    in_play: number;
    is_active: number;
    bet_allow: number;
}