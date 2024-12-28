import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService } from 'src/common/logger.service';
import configuration from 'src/configuration';
import { CacheService } from 'src/cache/cache.service';
import { Subject } from 'rxjs';
import { FancyUpdate } from 'src/model/fancyUpdate';

@Injectable()
export class FancyUpdateService implements OnModuleInit {
    private fancyMarketUpdates$ = new Subject<FancyUpdate[]>();

    constructor(
        private readonly cacheService: CacheService,
        private logger: LoggerService,
    ) {
        this.fancyMarketUpdates$
            .subscribe((updates) => this.processFancyMarketUpdates(updates));
    }

    onModuleInit() {
        this.processsToFancyEvents();
    }

    // async subscribeToFancyEventStream() {   
    //     return await this.cacheService.getStream(configuration.dragonflyClient, configuration.bookMakerSubKey,(data)=>{
    //         console.log(data);
    //     });
    // }

    async processsToFancyEvents() {
        try {
            while (true) {
                const task = await this.cacheService.brpop(configuration.sbtasksfancy, 0);
                if (task) {
                    const parsedTask = JSON.parse(task[1]);
                    this.logger.info(`Worker ${process.pid} processing task with: ${parsedTask.id}`, FancyUpdateService.name);
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
            const batchSize = 100; // Define the size of each batch
            const batches = [];

            // Split the fancyMarket updates into smaller batches
            for (let i = 0; i < fancyMarket.length; i += batchSize) {
                batches.push(fancyMarket.slice(i, i + batchSize));
            }
            // Process each batch
            for (const batch of batches) {
                await Promise.all(
                    batch.map(async (event) => {
                        try {
                            if (event.markets?.length) {
                                await Promise.all(
                                    event.markets.map(async (market) => {
                                        await this.cacheService.publish(
                                            configuration.redisPubClientFE,
                                            `${market.id}__fancy0`,
                                            JSON.stringify(market)
                                        );
                                    })
                                );
                            }
                        } catch (error) {
                            this.logger.error(`Error publish fancy event to Redis: ${error.message}`, FancyUpdateService.name);
                        }
                    })
                );
            }
        } catch (error) {
            this.logger.error(`processFancyMarketUpdate: ${error.message}`, FancyUpdateService.name);
        }
    }
}




