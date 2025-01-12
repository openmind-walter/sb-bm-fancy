export class CachedKeys {
  static getFancy(market_id, wl: number, provider_id) {
    return `sb_${market_id}_${wl}_${provider_id}`
  }
  static getBookMaker(market_id, wl: number, provider_id) {
    return `sb_${market_id}_${wl}_${provider_id}`
  }
}



