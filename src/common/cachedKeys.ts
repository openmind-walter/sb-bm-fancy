export class CachedKeys {
  static getFancyPub(market_id, wl: number, service_id, provider_id) {
    return `sb_${market_id}_${wl}_${service_id}_${provider_id}`
  }

  static getFancyHashField(eventId, wl: number, serviceId, providerId) {
    return `sb_fancy_${eventId}_${wl}_${serviceId}_${providerId}`;
  }

  static getBookMakerHashField(eventId, wl: number, serviceId, providerId) {
    return `sb_BM_${eventId}_${wl}_${serviceId}_${providerId}`;
  }
  static getBookMakerPub(market_id, wl: number, serviceId, provider_id) {
    return `sb_${market_id}_${wl}_${serviceId}_${provider_id}`;
  }
}



