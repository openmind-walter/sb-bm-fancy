import { LoggerService } from 'src/common/logger.service';
import configuration from 'src/configuration';
import { CacheService } from 'src/cache/cache.service';
import { WhiteLabelService } from './wl.service';
import { CachedKeys } from 'src/common/cachedKeys';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { FancyMarket } from '../../model/fancy.market';

@Processor('fancyUpdate')
export class FancyUpdateService {

    constructor(
        private readonly cacheService: CacheService,
        private logger: LoggerService,
        private whiteLabelService: WhiteLabelService
    ) {}

    @Process()
    async processFancyMarketUpdates(job: Job) {
        try {
            const { message } = job.data;
            const fancyMarket = JSON.parse(message) as FancyMarket[]
            if (!fancyMarket?.length) return;
       
            const wls = this.whiteLabelService.getActiveWhiteLabelsId();
            const batchSize = 100;
            for (let i = 0; i < fancyMarket.length; i += batchSize) {
                const batch = fancyMarket.slice(i, i + batchSize);
                await Promise.all(
                    batch.map(async (market) => {
                        if (market.runners?.length) {
                            await Promise.all(
                                market.runners.map(async (runner) => {
                                    for (let i = 0; i < wls.length; i++) {
                                        try {
                                            const marketKey = CachedKeys.getFancy(runner.selectionId, wls[i], runner.providerId);
                                            const runnerValue = JSON.stringify(runner);
                                            const timestamp = Date.now().toString();
                                            await this.cacheService.hset(
                                                configuration.redisPubClientFE,
                                                marketKey,
                                                'value',
                                                runnerValue
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
                                                runnerValue
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



