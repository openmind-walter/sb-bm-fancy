

export type EventType = {
    children: any;
    id: string;
    name: string;
};

export type Competition = {
    id: string;
    name: string;
};

export enum SIDE {
    BACK = 'BACK',
    LAY = 'LAY'
  }
  
  
  export enum BettingType {
    BOOKMAKER = "ODDS",
    FANCY = "LINE"
  }
  
