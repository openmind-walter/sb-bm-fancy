

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
  ID: number
  OLD_MAX_BET_SIZE: number;
  NEW_MAX_BET_SIZE: number;
  OLD_MIN_BET_SIZE: number;
  NEW_MIN_BET_SIZE: never;

}


export interface BookmakerFancyConfig {
  ID: number
  MIN_BET_SIZE: never;
  MAX_BET_SIZE: number;
}


