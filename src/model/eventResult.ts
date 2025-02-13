export class EventResult {
    EVENT_ID: string;
    MARKET_ID: string;
    PROVIDER_ID: string;
    PROVIDER: String;
    CLOSED_TIME: string;
    RESULT: any;
    SELECTION_ID: number;

    constructor(
        EVENT_ID: string,
        MARKET_ID: string,
        SELECTION_ID: number,
        PROVIDER_ID: string,
        PROVIDER: string,
        CLOSED_TIME: string,
        RESULT: any,

    ) {
        this.EVENT_ID = EVENT_ID;
        this.MARKET_ID = MARKET_ID;
        this.PROVIDER_ID = PROVIDER_ID;
        this.PROVIDER = PROVIDER;
        this.CLOSED_TIME = CLOSED_TIME;
        this.RESULT = RESULT;
        this.SELECTION_ID = SELECTION_ID;
    }
}
