import { LoggerService } from 'src/common/logger.service';
import configuration from 'src/configuration';
import { CacheService } from 'src/cache/cache.service';
import { WhiteLabelService } from './wl.service';
import { CachedKeys } from 'src/common/cachedKeys';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { isEqual } from 'lodash';
import { BookmakerMarket, BookmakerRunner, BookmakerRunnerStaus, BookMakersUpdate } from 'src/model/bookmaker';
import { SettlementService } from './settlement.service';

const { redisPubClientFE, sbHashKey, dragonflyClient } = configuration;



@Processor('bookMakerUpdate')
export class BookMakerUpdateService {

    constructor(
        private readonly cacheService: CacheService,
        private logger: LoggerService,
        private whiteLabelService: WhiteLabelService,
        private settlementService: SettlementService
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

            const serviceId = `${wl}-${newBookMaker.serviceId}`;
            const field = CachedKeys.getBookMakerHashField(newBookMaker.eventId, serviceId, newBookMaker.providerId);
            const marketPubKey = CachedKeys.getBookMakerPub(newBookMaker.marketId, wl, newBookMaker.serviceId, newBookMaker.providerId);

            const bookMakerMarketHash = await this.cacheService.hGet(dragonflyClient, sbHashKey, field);
            const existingBookMakerMarket: BookmakerMarket | null = bookMakerMarketHash
                ? (JSON.parse(bookMakerMarketHash) as BookmakerMarket)
                : null;
            const hasOtherMarketChanges = this.hasMarketChanges(existingBookMakerMarket, newBookMaker);
            const changedRunners = this.getChangedRunners(existingBookMakerMarket, newBookMaker);

            if (!bookMakerMarketHash || changedRunners.length > 0 || hasOtherMarketChanges) {
                const updatedBookMakerMarket = this.mergeBookMakerMarkets(
                    newBookMaker,
                    serviceId,
                    marketPubKey
                );
                await this.cacheService.hset(dragonflyClient, sbHashKey, field, JSON.stringify(updatedBookMakerMarket));
                await this.cacheService.publish(
                    redisPubClientFE,
                    marketPubKey,
                    JSON.stringify({
                        ...updatedBookMakerMarket,
                        runners: this.filterOutSettledRunners(changedRunners.length > 0 ? changedRunners : updatedBookMakerMarket.runners)
                    })
                );

                if (changedRunners.length > 0) {
                    const settledRunners = newBookMaker.runners.filter(runner => runner.status == BookmakerRunnerStaus.LOSER || runner.status == BookmakerRunnerStaus.WINNER || runner.status == BookmakerRunnerStaus.REMOVED);
                    Promise.all(settledRunners.map(runner => this.settlementService.bookMakerBetSettlement(newBookMaker.marketId,
                        newBookMaker.providerId, runner, (newBookMaker.status)))).catch(err => this.logger.error("Settlement error:", err));
                }

            }

        } catch (error) {
            this.logger.error(`updateBookMakerMarketHash: ${error.message}`, BookMakerUpdateService.name);
            return null;
        }
    }


    private hasMarketChanges(existingBookMakerMarket: BookmakerMarket | null, newBookMaker: BookmakerMarket): boolean {
        if (!existingBookMakerMarket) return true;

        const ignoreKeys = ['runners', 'topic', 'updatedAt'];
        const relevantKeys = Object.keys(newBookMaker).filter(key => !ignoreKeys.includes(key));

        return relevantKeys.some(key => !isEqual(existingBookMakerMarket[key], newBookMaker[key]));
    }
    private getChangedRunners(existingBookMakerMarket: BookmakerMarket | null, newBookMaker: BookmakerMarket): BookmakerRunner[] {
        if (!existingBookMakerMarket?.runners?.length) return newBookMaker.runners;

        return newBookMaker.runners.filter(runner => {
            const existingRunner = existingBookMakerMarket.runners.find(r => Number(r.selectionId) === Number(runner.selectionId));
            return !isEqual(existingRunner, runner);
        });
    }

    private mergeBookMakerMarkets(
        newBookMaker: BookmakerMarket,
        serviceId: string,
        marketPubKey: string
    ): BookmakerMarket {
        const updatedAt = new Date().toISOString();
        return {
            ...newBookMaker,
            serviceId,
            topic: marketPubKey,
            updatedAt
        };
    }

    private filterOutSettledRunners(bookmakeRunners: BookmakerRunner[]): BookmakerRunner[] {
        return bookmakeRunners.map(runner => {
            return (runner?.status == BookmakerRunnerStaus.LOSER || runner?.status == BookmakerRunnerStaus.WINNER) ?
                { ...runner, status: BookmakerRunnerStaus.CLOSED } : runner
        });

    }

}






