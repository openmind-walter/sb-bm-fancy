import { LoggerService } from 'src/common/logger.service';
import configuration from 'src/configuration';
import { CacheService } from 'src/cache/cache.service';
import { FancyUpdate } from 'src/model/fancyUpdate';
import { WhiteLabelService } from './wl.service';
import { CachedKeys } from 'src/common/cachedKeys';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('fancyUpdate')
export class FancyUpdateService {

    constructor(
        private readonly cacheService: CacheService,
        private logger: LoggerService,
        private whiteLabelService: WhiteLabelService
    ) {

    }



    @Process()
    async processFancyMarketUpdates(job: Job) {
        try {
            const { message } = job.data;
            const fancyMarket = JSON.parse(message) as FancyUpdate[]
            if (!fancyMarket?.length) return;
            const wls = this.whiteLabelService.getActiveWhiteLabelsId();
            const batchSize = 100;
            for (let i = 0; i < fancyMarket.length; i += batchSize) {
                const batch = fancyMarket.slice(i, i + batchSize);
                await Promise.all(
                    batch.map(async (event) => {
                        if (event.markets?.length) {
                            await Promise.all(
                                event.markets.map(async (market) => {
                                    for (let i = 0; i < wls.length; i++) {
                                        try {
                                            const marketKey = CachedKeys.getFancy(market.marketId, wls[i], market.fancy_id);
                                            const marketValue = JSON.stringify(market);
                                            const timestamp = Date.now().toString();
                                            await this.cacheService.hset(
                                                configuration.redisPubClientFE,
                                                marketKey,
                                                'value',
                                                marketValue
                                            );
                                            await this.cacheService.hset(
                                                configuration.redisPubClientFE,
                                                marketKey,
                                                'timestamp',
                                                timestamp
                                            );
                                            await this.cacheService.publish(
                                                configuration.redisPubClientFE,
                                                marketKey,
                                                marketValue
                                            );
                                        } catch (error) {
                                            this.logger.error(`Error publishing fancy event to Redis: ${error.message}`, FancyUpdateService.name);
                                        }
                                    }
                                })
                            );
                        }
                    })
                );
            }
        } catch (error) {
            this.logger.error(`processFancyMarketUpdates: ${error.message}`, FancyUpdateService.name);
        }
    }


}



