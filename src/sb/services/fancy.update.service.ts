import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService } from 'src/common/logger.service';
import configuration from 'src/configuration';
import { CacheService } from 'src/cache/cache.service';
import { Subject } from 'rxjs';
import { FancyUpdate } from 'src/model/fancyUpdate';
import { WhiteLabelService } from './wl.service';
import { CachedKeys } from 'src/common/cachedKeys';

@Injectable()
export class FancyUpdateService implements OnModuleInit {
    private fancyMarketUpdates$ = new Subject<FancyUpdate[]>();

    constructor(
        private readonly cacheService: CacheService,
        private logger: LoggerService,
        private whiteLabelService: WhiteLabelService
    ) {
        this.fancyMarketUpdates$
            .subscribe((updates) => this.processFancyMarketUpdates(updates));
    }

    onModuleInit() {
        this.processsToFancyEvents();
    }



    async processsToFancyEvents() {
        try {
            while (true) {
                const task = await this.cacheService.brpop(configuration.sbtasksfancy, 0);
                if (task) {
                    const parsedTask = JSON.parse(task[1]);
                    // this.logger.info(`Worker ${process.pid} processing task with: ${parsedTask.id}`, FancyUpdateService.name);
                    const fancyMarket = parsedTask.data as FancyUpdate[];
                    this.fancyMarketUpdates$.next(fancyMarket);

                }
            }
        } catch (error) {
            this.logger.error(`processsToFancyEvents: ${error.message}`, FancyUpdateService.name);
        }
    }

    private async processFancyMarketUpdates(fancyMarket: FancyUpdate[]) {
        try {

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



