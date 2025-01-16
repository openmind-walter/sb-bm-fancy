import { LoggerService } from 'src/common/logger.service';
import configuration from 'src/configuration';
import { CacheService } from 'src/cache/cache.service';
import { WhiteLabelService } from './wl.service';
import { CachedKeys } from 'src/common/cachedKeys';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { isEqual } from 'lodash';
import { BookmakerMarket, BookmakerRunnerStaus, BookMakersUpdate } from 'src/model/bookmaker';

const { redisPubClientFE, sbHashKey, dragonflyClient } = configuration;

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

                                const wlbookmakers = bookMakersUpdate.bookMakers
                                // await this.whiteLabelService.filterWLBookmakers(wls[i], bookMakersUpdate.bookMakers);

                                await Promise.all(
                                    wlbookmakers.map(async (bookMaker: BookmakerMarket) => this.updateBookMakerMarketHash(bookMaker, wls[i])));
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


    private async updateBookMakerMarketHash(newBookMaker: BookmakerMarket, wl: number) {
        try {
            if (!newBookMaker) return;
            const serviceId = `${wl}-${newBookMaker.serviceId}`;
            let changed = false;
            const field = CachedKeys.getBookMakerHashField(newBookMaker.eventId, serviceId, newBookMaker.providerId);

            const bookMakerMarketHash = await this.cacheService.hGet(dragonflyClient, sbHashKey, field);
            const bookMaker = bookMakerMarketHash ? JSON.parse(bookMakerMarketHash) : null;
            if (bookMaker) {
                delete bookMaker.topic;
            }
            if (bookMaker && !isEqual(bookMaker, newBookMaker)) {
                changed = true;
            }

            if (!bookMakerMarketHash || changed) {
                const updatedAt = (new Date()).toISOString();
                const marketPubKey = CachedKeys.getBookMakerPub(newBookMaker.marketId, wl, newBookMaker.serviceId, newBookMaker.providerId);
                const bookMakerMarketUpdate = { ...newBookMaker, serviceId, topic: marketPubKey,updatedAt } as  BookmakerMarket;
                await this.cacheService.hset(dragonflyClient, sbHashKey, field, JSON.stringify(bookMakerMarketUpdate));
                const filteredBookMaker = this.filterOutSettledMarket(bookMakerMarketUpdate)
                await this.cacheService.publish(
                    redisPubClientFE,
                    marketPubKey,
                    JSON.stringify(filteredBookMaker)
                );
            }

        } catch (error) {
            this.logger.error(`updateBookMakerMarketHash: ${error.message}`, BookMakerUpdateService.name);
            return newBookMaker;
        }
    }

    private filterOutSettledMarket(bookmaker: BookmakerMarket) {
        const runners = bookmaker?.runners.map(runner => {
            return (runner?.status == BookmakerRunnerStaus.LOSER || runner?.status == BookmakerRunnerStaus.WINNER) ?
                { ...runner, status: BookmakerRunnerStaus.CLOSED } : runner
        });
        return { ...bookmaker, runners };
    }

}






