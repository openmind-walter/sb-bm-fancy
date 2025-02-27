

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



export interface BookmakerFancyConfigUpdate {
  id: number;
  old_max_bet_size: number;
  new_max_bet_size: number;
  old_min_bet_size: number;
  new_min_bet_size: number;
}


export interface BookmakerFancyConfig {
  ID: number
  MIN_BET_SIZE: never;
  MAX_BET_SIZE: number;
}


