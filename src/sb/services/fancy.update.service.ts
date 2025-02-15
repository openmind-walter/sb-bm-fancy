import { LoggerService } from 'src/common/logger.service';
import configuration from 'src/configuration';
import { CacheService } from 'src/cache/cache.service';
import { WhiteLabelService } from './wl.service';
import { CachedKeys } from 'src/common/cachedKeys';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { FancyMarket, FancyMarketRunner, FancyRunnerStaus } from '../../model/fancy.market';
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
            const fieldStore = CachedKeys.getFancyStoreHashField(fancyMarket.eventId, serviceId, fancyMarket.providerId);
            const marketPubKey = CachedKeys.getFancyPub(fancyMarket.marketId, wl, fancyMarket.serviceId, fancyMarket.providerId);

            const fancyMarketHash = await this.cacheService.hGet(dragonflyClient, sbHashKey, field);
            const existingFancyMarket: FancyMarket | null = fancyMarketHash
                ? (JSON.parse(fancyMarketHash) as FancyMarket)
                : null;

            const changedRunners = this.getChangedRunners(existingFancyMarket, fancyMarket) || [];


            if (!fancyMarketHash || changedRunners.length > 0) {
                const updatedFancyMarket = this.mergeFancyMarkets(
                    fancyMarket,
                    existingFancyMarket,
                    serviceId,
                    marketPubKey
                );

                const updatedStoreFancyMarket = this.mergeFancyStoreMarkets(
                    fancyMarket,
                    existingFancyMarket,
                    serviceId,
                    marketPubKey
                );
                await this.cacheService.hset(dragonflyClient, sbHashKey, field, JSON.stringify(updatedFancyMarket));
                await this.cacheService.hset(dragonflyClient, sbHashKey, fieldStore, JSON.stringify(updatedStoreFancyMarket));
                const nonExistingRunners = (existingFancyMarket?.runners ?? []).filter(existingRunner =>
                    !(fancyMarket.runners ?? []).some(fancyRunner =>
                        Number(fancyRunner.selectionId) == Number(existingRunner.selectionId)
                    )
                ).map(runner => ({ ...runner, status: FancyRunnerStaus.CLOSED }));


                await this.cacheService.publish(
                    redisPubClientFE,
                    marketPubKey,
                    JSON.stringify({ ...updatedFancyMarket, runners: changedRunners.length > 0 ? [...changedRunners, ...nonExistingRunners] : updatedFancyMarket.runners })
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

        // Keep only the runners that exist in fancyMarket
        const existingRunners = existingFancyMarket?.runners?.filter(existingRunner =>
            fancyMarket.runners?.some(fancyRunner =>
                Number(fancyRunner.selectionId) == Number(existingRunner.selectionId)
            )
        ) || [];



        // Add new runners from fancyMarket that are not in existingFancyMarket
        const newRunners = fancyMarket.runners?.filter(fancyRunner =>
            !existingFancyMarket?.runners?.some(existingRunner =>
                Number(existingRunner.selectionId) == Number(fancyRunner.selectionId)
            )
        ) || [];

        return {
            ...fancyMarket,
            serviceId,
            runners: [...existingRunners, ...newRunners],
            topic: marketPubKey,
            updatedAt,
        } as FancyMarket;
    }


    private mergeFancyStoreMarkets(
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



