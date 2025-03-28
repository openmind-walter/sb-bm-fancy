import { LoggerService } from 'src/common/logger.service';
import configuration from 'src/configuration';
import { CacheService } from 'src/cache/cache.service';
import { WhiteLabelService } from './wl.service';
import { CachedKeys } from 'src/common/cachedKeys';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { FancyMarket, FancyMarketRunner, FancyRunnerStaus } from '../../model/fancy.market';
import { isEqual } from 'lodash';
import { BmFancyConfigService } from './bm.fancy.config.service';

const { redisPubClientFE, dragonflyClient, sbHashKey } = configuration;
@Processor('fancyUpdate')
export class FancyUpdateService {

    constructor(
        private readonly cacheService: CacheService,
        private logger: LoggerService,
        private whiteLabelService: WhiteLabelService,
        private bmFacnyConfigService: BmFancyConfigService
    ) { }

    @Process()
    async processFancyMarketUpdates(job: Job) {
        try {
            const { message } = job.data;
            const fancyMarkets = JSON.parse(message) as FancyMarket[]
            if (!fancyMarkets?.length) return;
            const wls =  this.whiteLabelService.getActiveWhiteLabelsId();

            await Promise.all(
                fancyMarkets.map(async (market) => {
                    for (let i = 0; i < wls.length; i++) {
                        const configMarket = this.bmFacnyConfigService.upateMinMaxBetSizeFacyMarket(market);
                        await this.updateFancyMarketHash(configMarket, wls[i])

                    }
                })
            );

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
            const fancyMarketCahedHash = await this.cacheService.hGet(dragonflyClient, sbHashKey, fieldStore);
            const existingFancyMarket: FancyMarket | null = fancyMarketHash
                ? (JSON.parse(fancyMarketHash) as FancyMarket)
                : null;

            const cahedFancyMarket: FancyMarket | null = fancyMarketCahedHash
                ? (JSON.parse(fancyMarketCahedHash) as FancyMarket)
                : null;

            const changedRunners = this.getChangedRunners(existingFancyMarket, fancyMarket) || [];
            const nonExistingRunners = (existingFancyMarket?.runners ?? [])
                .filter(existingRunner =>
                    !(fancyMarket?.runners ?? []).some(fancyRunner =>
                        Number(fancyRunner.selectionId) === Number(existingRunner.selectionId)
                    )
                )
                .map(runner => ({ ...runner, status: FancyRunnerStaus.CLOSED }));


            if (!fancyMarketHash || changedRunners.length > 0  || nonExistingRunners.length > 0) {


                if (fancyMarket?.runners?.length > 0) {
                    const updatedStoreFancyMarket = this.mergeFancyStoreMarkets(
                        fancyMarket,
                        cahedFancyMarket,
                        serviceId,
                        marketPubKey
                    );
                     await this.cacheService.hset(dragonflyClient, sbHashKey, fieldStore, JSON.stringify(updatedStoreFancyMarket));
                }
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
                    JSON.stringify({ ...updatedFancyMarket, runners: changedRunners.length > 0 ? [...changedRunners, ...nonExistingRunners] : updatedFancyMarket.runners })
                );
            }

        } catch (error) {

            this.logger.error(`update fancy market hash: ${error.message}`, FancyUpdateService.name);
            return null;
        }
    }

    private getChangedRunners(existingFancyMarket: FancyMarket | null, fancyMarket: FancyMarket): FancyMarketRunner[] {
        if (!existingFancyMarket?.runners?.length) return fancyMarket.runners ?? [];

        return (fancyMarket.runners ?? []).filter(runner => {
            const existingRunner = (existingFancyMarket?.runners ?? []).find(r => Number(r?.selectionId) == Number(runner?.selectionId));
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
        const fancyRunners = fancyMarket?.runners ?? [];
        const existingRunners = existingFancyMarket?.runners ?? [];

        const runnerUpdate = fancyRunners.map(fancyRunner => {
            const existingRunner = existingRunners.find(existingRunner =>
                Number(existingRunner?.selectionId) === Number(fancyRunner?.selectionId)
            );
            return existingRunner ? { ...existingRunner, ...fancyRunner } : fancyRunner;
        });

        return {
            ...fancyMarket,
            serviceId,
            runners: runnerUpdate,
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

        const fancyRunners = fancyMarket?.runners ?? [];
        const existingRunners = existingFancyMarket?.runners ?? [];

        const runnerUpdate = [
            ...fancyRunners,
            ...existingRunners.filter(existingRunner =>
                !fancyRunners.some(fancyRunner =>
                    Number(fancyRunner?.selectionId) === Number(existingRunner?.selectionId)
                )
            ),
        ];

        return {
            ...fancyMarket,
            serviceId,
            runners: runnerUpdate,
            topic: marketPubKey,
            updatedAt,
        } as FancyMarket;
    }


}



