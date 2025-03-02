export interface MarketOutCome {
    id: number;
    event_type_id: number;
    event_id: number;
    market_id: number;
    market_type: string;
    type: MarketOutComeType;
    result: number;
    created_at: number;
}

export enum MarketOutComeType {
    BM = "BM",
    FANCY = "FANCY"
}