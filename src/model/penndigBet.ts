import { SIDE } from ".";

export class PendingBet {
    ID: string;
    BF_BET_ID: string;
    BF_ACCOUNT: string;
    EVENT_ID: string;
    SPORT_ID: number;
    MARKET_ID: string;
    SIZE: number;
    PRICE_MATCHED?: number;
    POTENTIAL_PROFIT?: number;
    SIZE_MATCHED: number;
    POTENTIAL_LOSS?: number;
    SELECTION_ID?: number
    SIDE: SIDE;
    STATUS: string;
    SIZE_REMAINING?: number
    PROVIDER: string;
    PRICE: number;
    BETTING_TYPE: string;
}