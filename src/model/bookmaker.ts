import { Competition, EventType } from ".";



export interface BookMakersUpdate {
    eventId: string;
    bookMakers: BookmakerMarket[];
}[]

export interface BookmakerMarket {
    providerId: string;
    marketId: string;
    name: string;
    eventId: string;
    eventName?: string;
    minBet: number;
    isActive: number;
    betAllow: number;
    type: BookmakerType;
    status: BookmakerStaus;
    maxProfit: number;
    betDelay: number;
    oddType: BookmakerOddType;
    offPlayMaxBet: number;
    isOtherRateActive: number;
    eventType?: EventType;
    competition?: Competition;
    runners: BookmakerRunner[];
}



export interface BookmakerRunner {
    name: string;
    selection_id: number;
    back_price: number;
    lay_price: number;
    back_volume: number;
    lay_volume: number;
    handicap: number;
    sort: number;
    status: BookmakerRunnerStaus;
}

export enum BookmakerType {
    MATCH_ODDS = 'MATCH_ODDS',
    TO_WIN_THE_TOSS = 'TO_WIN_THE_TOSS',
    EXTRA_BOOKMAKER = 'EXTRA_BOOKMAKER'
}

export enum BookmakerOddType {
    DIGIT = 'DIGIT',
    ODDS = 'ODDS'
}


export enum BookmakerStaus {
    OPEN = "OPEN",
    BALL_RUNNING = "BALL_RUNNING",
    CLOSED = "CLOSED",
    SUSPENDED = "SUSPENDED",
    REMOVED = "REMOVED"
}




export enum BookmakerRunnerStaus {
    ACTIVE = "ACTIVE",
    LOSER = "LOSER",
    BALL_RUNNING = "BALL_RUNNING",
    CLOSED = "CLOSED",
    SUSPENDED = "SUSPENDED",
    REMOVED = "REMOVED",
    WINNER = "WINNER"
}







