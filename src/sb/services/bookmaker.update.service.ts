import { LoggerService } from 'src/common/logger.service';
import configuration from 'src/configuration';
import { CacheService } from 'src/cache/cache.service';
import { WhiteLabelService } from './wl.service';
import { CachedKeys } from 'src/common/cachedKeys';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { BookmakerMarket, BookMakersUpdate } from 'src/model/bookmaker';


@Processor('bookMakerUpdate')
export class BookMakerUpdateService {

    constructor(
        private readonly cacheService: CacheService,
        private logger: LoggerService,
        private whiteLabelService: WhiteLabelService
    ) {

    }


    @Process()
    async processBookMakerMarketUpdates(job: Job) {
        try {
            const { message } = job.data;
            const eventbookmakers = JSON.parse(message) as BookMakersUpdate[]
            if (!eventbookmakers?.length) return;
         
            const batchSize = 100; // Define the size of each batch
            const batches = [];

            // Split the eventbookmakers updates into smaller batches
            for (let i = 0; i < eventbookmakers.length; i += batchSize) {
                batches.push(eventbookmakers.slice(i, i + batchSize));
            }

            // Process each batch
            for (const batch of batches) {
                await Promise.all(
                    batch.map(async (bookMakersUpdate: BookMakersUpdate) => {
                        try {
                            const wls = this.whiteLabelService.getActiveWhiteLabelsId();
                            for (let i = 0; i < wls.length; i++) {
                                const wlbookmakers = await this.whiteLabelService.filterWLBookmakers(wls[i], bookMakersUpdate.bookMakers);
                                await Promise.all(
                                    wlbookmakers.map(async (bookMaker: BookmakerMarket) => {
                                     
                                        const market_id = bookMaker.marketId;
                                        const bmStringified = JSON.stringify(bookMaker);
                                        const timestamp = Date.now().toString();
                                        const marketKey = CachedKeys.getBookMaker(market_id, wls[i], bookMaker.providerId);
                                        await this.cacheService.hset(
                                            configuration.redisPubClientFE,
                                            marketKey,
                                            'value',
                                            bmStringified
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
                                            bmStringified
                                        );
                                    })
                                );
                            }
                        } catch (error) {
                            this.logger.error(
                                `Error publishing book maker event to Redis: ${error.message}`,
                                BookMakerUpdateService.name
                            );
                        }
                    })
                );
            }

        } catch (error) {
            this.logger.error(`processBookMakerMarketUpdate: ${error.message}`, BookMakerUpdateService.name);
        }
    }
}






