import { SIDE } from ".";

export class PendingBet {
    ID: string;
    EVENT_ID: string;
    MARKET_ID: string;
    SIZE: number;
    SERVICE_ID: string
    SELECTION_ID?: number
    SIDE: SIDE;
    PROVIDER_ID: string;
    PRICE: number;
    BETTING_TYPE: string;
    BF_BET_ID:string;
}