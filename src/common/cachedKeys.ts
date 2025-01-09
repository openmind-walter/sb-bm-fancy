export class CachedKeys {
  static getFancy(market_id, wl: number, fancy_id) {
    return `sb_${market_id}_${wl}_${fancy_id}`
  }
  static getBookMaker(market_id, wl: number, bookmaker_id) {
    return `sb_${market_id}_${wl}_${bookmaker_id}`
  }
}



