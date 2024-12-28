import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService } from 'src/common/logger.service';
import configuration from 'src/configuration';
import { Subject } from 'rxjs';
import { BookMakersUpdate } from 'src/model/boomakerUpdate';
import { CacheService } from 'src/cache/cache.service';
import { BookmakerData } from 'src/model/bookmaker';


@Injectable()
export class BookMakerUpdateService implements OnModuleInit {
    private bookMakerMarketUpdates$ = new Subject<BookMakersUpdate[]>();

    constructor(
        private readonly cacheService: CacheService,
        private logger: LoggerService,
    ) {
        this.bookMakerMarketUpdates$
            .subscribe((updates) => this.processBookMakerMarketUpdates(updates));
    }

    onModuleInit() {

        this.processsToBookMakerEvents();
    }



    async processsToBookMakerEvents() {
        try {
            while (true) {
                const task = await this.cacheService.brpop(configuration.sbTasksBookMaker, 0);
                if (task) {
                    const parsedTask = JSON.parse(task[1]);

                    this.logger.info(`Worker ${process.pid} processing task with : ${parsedTask.id}`, BookMakerUpdateService.name);
                    const BookMakerMarket = parsedTask.data as BookMakersUpdate[];
                    this.bookMakerMarketUpdates$.next(BookMakerMarket);
                }
            }
        } catch (error) {
            this.logger.error(`processsToBookMakerEvents: ${error.message}`, BookMakerUpdateService.name);
        }
    }

    private async processBookMakerMarketUpdates(eventbookmakers: BookMakersUpdate[]) {
        try {
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
                            await Promise.all(
                                bookMakersUpdate.bookMakers.map(async (bookMaker: BookmakerData) => {
                                    const market_id = bookMaker.market_id;
                                    const bmStringified = JSON.stringify(bookMaker);
                                    await this.cacheService.publish(
                                        configuration.redisPubClientFE,
                                        `${market_id}_${bookMaker.bookmaker_id}`,
                                        bmStringified
                                    );
                                })
                            );
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






