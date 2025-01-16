import { Competition, EventType } from ".";



export interface BookMakersUpdate {
    eventId: string;
    bookMakers: BookmakerMarket[];
}[]

export interface BookmakerMarket {
    providerId: string;
    serviceId: string;
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
    topic?: string;
    updatedAt?: string;
    runners: BookmakerRunner[];
}



export interface BookmakerRunner {
    selectionId: number;
    runnerName: string;
    backPrice: number;
    layPrice: number;
    backVolume: number;
    layVolume: number;
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







