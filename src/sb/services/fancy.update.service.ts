import { LoggerService } from 'src/common/logger.service';
import configuration from 'src/configuration';
import { CacheService } from 'src/cache/cache.service';
import { WhiteLabelService } from './wl.service';
import { CachedKeys } from 'src/common/cachedKeys';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { FancyMarket, FancyMarketRunner } from '../../model/fancy.market';
import { isEqual } from 'lodash';


const { redisPubClientFE, dragonflyClient, sbHashKey } = configuration;
@Processor('fancyUpdate')
export class FancyUpdateService {

    constructor(
        private readonly cacheService: CacheService,
        private logger: LoggerService,
        private whiteLabelService: WhiteLabelService
    ) { }

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
                        for (let i = 0; i < wls.length; i++) {
                            if (market.runners?.length > 0) {
                                await this.updateFancyMarketHash(market, wls[i])

                            }

                        }
                    })
                );
            }
        } catch (error) {
            this.logger.error(`processFancyMarketUpdates: ${error.message}`, FancyUpdateService.name);
        }
    }


    private async updateFancyMarketHash(fancyMarket: FancyMarket, wl: number) {
        try {
            const changedRunners: FancyMarketRunner[] = [];
            const field = CachedKeys.getFancyHashField(fancyMarket.eventId, wl, fancyMarket.serviceId, fancyMarket.providerId);
            // console.log(field )
            const fancyMarketHash = await this.cacheService.hGet(dragonflyClient, sbHashKey, field);
            if (fancyMarketHash) {

                const existingFancyMarket = JSON.parse(fancyMarketHash) as FancyMarket;

                fancyMarket.runners.forEach(runner => {
                    const existingRunner = existingFancyMarket.runners.find(r => r.selectionId === runner.selectionId);
                    if (!isEqual(existingRunner, runner)) {
                        changedRunners.push(runner);
                        this.logger.info(`fancy event runner  update change event id: ${runner?.selectionId}  event: ${fancyMarket?.eventId}`, FancyUpdateService.name)
                    }
                });
            }
            if (!fancyMarketHash || changedRunners.length > 0) {

                const marketPubKey = CachedKeys.getFancyPub(fancyMarket.marketId, wl, fancyMarket.serviceId, fancyMarket.providerId);
                const fancyMarketUpdate = { ...fancyMarket, topic: marketPubKey };
                await this.cacheService.hset(dragonflyClient, sbHashKey, field, JSON.stringify(fancyMarketUpdate));

                const marketPubUpdate = changedRunners.length > 0 ? { ...fancyMarketUpdate, runners: changedRunners } : fancyMarketUpdate;
                await this.cacheService.publish(
                    redisPubClientFE,
                    marketPubKey,
                    JSON.stringify(marketPubUpdate)
                );
                this.logger.info(`fancy event   update   ${fancyMarket?.eventId}`, FancyUpdateService.name);
            }

        } catch (error) {
            this.logger.error(`updateFancyMarketHash: ${error.message}`, FancyUpdateService.name);
            return fancyMarket;
        }
    }

}



