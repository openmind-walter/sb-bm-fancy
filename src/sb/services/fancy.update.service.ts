import { LoggerService } from 'src/common/logger.service';
import configuration from 'src/configuration';
import { CacheService } from 'src/cache/cache.service';
import { WhiteLabelService } from './wl.service';
import { CachedKeys } from 'src/common/cachedKeys';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { FancyMarket, FancyMarketRunner, FancyRunnerStaus } from '../../model/fancy.market';
import { isEqual } from 'lodash';
// import { SettlementService } from './settlement.service';


const { redisPubClientFE, dragonflyClient, sbHashKey } = configuration;
@Processor('fancyUpdate')
export class FancyUpdateService {

    constructor(
        private readonly cacheService: CacheService,
        private logger: LoggerService,
        private whiteLabelService: WhiteLabelService,
        // private settlementService: SettlementService
    ) { }

    @Process()
    async processFancyMarketUpdates(job: Job) {
        try {
            const { message } = job.data;
            const fancyMarkets = JSON.parse(message) as FancyMarket[]
            if (!fancyMarkets?.length) return;
            const wls = this.whiteLabelService.getActiveWhiteLabelsId();

            for (let i = 0; i < wls.length; i++) {
                await Promise.all(
                    fancyMarkets.map(async (market) => {
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




    private async updateFancyMarketHash(fancyMarket: FancyMarket, wl: number): Promise<FancyMarket | null> {
        try {
            const serviceId = `${wl}-${fancyMarket.serviceId}`;
            const field = CachedKeys.getFancyHashField(fancyMarket.eventId, serviceId, fancyMarket.providerId);
            const marketPubKey = CachedKeys.getFancyPub(fancyMarket.marketId, wl, fancyMarket.serviceId, fancyMarket.providerId);

            const fancyMarketHash = await this.cacheService.hGet(dragonflyClient, sbHashKey, field);
            const existingFancyMarket: FancyMarket | null = fancyMarketHash
                ? (JSON.parse(fancyMarketHash) as FancyMarket)
                : null;

            const changedRunners = this.getChangedRunners(existingFancyMarket, fancyMarket);

            // const settledRunners = this.getSettledRunners(changedRunners);

            // if (settledRunners.length > 0) {
            //     console.log("Settled fancy market runners:", JSON.stringify(settledRunners, null, 2));

            //     await Promise.all(
            //         settledRunners.map(runner =>
            //             this.settlementService.fancyBetSettlement(
            //                 fancyMarket.marketId,
            //                 fancyMarket.providerId,
            //                 runner
            //             )
            //         )
            //     );
            // }

            if (!fancyMarketHash || changedRunners.length > 0) {
                const updatedFancyMarket = this.mergeFancyMarkets(
                    fancyMarket,
                    existingFancyMarket,
                    serviceId,
                    marketPubKey
                );

                await this.cacheService.hset(dragonflyClient, sbHashKey, field, JSON.stringify(updatedFancyMarket));
                await this.cacheService.publish(
                    redisPubClientFE,
                    marketPubKey,
                    JSON.stringify({ ...updatedFancyMarket, runners: changedRunners.length > 0 ? changedRunners : updatedFancyMarket.runners })
                );
            }

        } catch (error) {
            this.logger.error(`update fancy market hash: ${error.message}`, FancyUpdateService.name);
            return null;
        }
    }

    private getChangedRunners(existingFancyMarket: FancyMarket | null, fancyMarket: FancyMarket): FancyMarketRunner[] {
        if (!existingFancyMarket?.runners?.length) return fancyMarket.runners;

        return fancyMarket.runners.filter(runner => {
            const existingRunner = existingFancyMarket.runners.find(r => Number(r.selectionId) == Number(runner.selectionId));
            return !isEqual(existingRunner, runner);
        });
    }

    private getSettledRunners(changedRunners: FancyMarketRunner[]): FancyMarketRunner[] {
        return changedRunners.filter(
            runner =>
                runner.status == FancyRunnerStaus.CLOSED ||
                runner.status == FancyRunnerStaus.REMOVED
        );
    }

    private mergeFancyMarkets(
        fancyMarket: FancyMarket,
        existingFancyMarket: FancyMarket | null,
        serviceId: string,
        marketPubKey: string
    ): FancyMarket {
        const updatedAt = new Date().toISOString();
        const runnerUpdate = fancyMarket.runners
            ? [
                ...fancyMarket.runners,
                ...(existingFancyMarket?.runners?.filter(existingRunner =>
                    !fancyMarket.runners.some(fancyRunner => Number(fancyRunner.selectionId) == Number(existingRunner.selectionId))
                ) || []),
            ]
            : existingFancyMarket?.runners || [];

        return {
            ...fancyMarket,
            serviceId,
            runners: runnerUpdate,
            topic: marketPubKey,
            updatedAt,
        } as FancyMarket;
    }


}



