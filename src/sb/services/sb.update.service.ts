import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService } from 'src/common/logger.service';
import { CacheService } from 'src/cache/cache.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import configuration from 'src/configuration';

@Injectable()
export class SBUpdateService implements OnModuleInit {

    constructor(
        @InjectQueue('bookMakerUpdate') private readonly bookMakerUpdate: Queue,
        @InjectQueue('fancyUpdate') private readonly fancyUpdate: Queue,
        private readonly cacheService: CacheService,
        private logger: LoggerService
    ) { }

    async onModuleInit() {
        this.subscribeToBookMakerUpdate();
        this.subscribeToFancyUpdate();
    }

    async subscribeToBookMakerUpdate() {
        try {
            const { dragonflySubClient, bookMakerSubKey } = configuration;
            this.cacheService.subscribe(dragonflySubClient, bookMakerSubKey, async (message) => {

                await this.bookMakerUpdate.add({message})
            })
        } catch (error) {
            this.logger.error(
                `Error subscribeToBookMakerUpdate': ${error.message}`,
                SBUpdateService.name
            );
        }

    }


    async subscribeToFancyUpdate() {
        try {
            const { dragonflySubClient, fancySubKey } = configuration;
            await this.cacheService.subscribe(dragonflySubClient, fancySubKey, async (message) => {
                await this.fancyUpdate.add({message})
            })
        } catch (error) {
            this.logger.error(
                `Error subscribeToFancyUpdate': ${error.message}`,
                SBUpdateService.name
            );
        }
    }
}
