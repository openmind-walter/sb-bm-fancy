import { Module } from '@nestjs/common';
import { LoggerService } from 'src/common/logger.service';
import { BookMakerUpdateService } from './services/bookmaker.update.service';
import { FancyUpdateService } from './services/fancy.update.service';
import { CacheModule } from 'src/cache/cache.module';




@Module({
    imports: [CacheModule],
    providers: [LoggerService, BookMakerUpdateService,
        FancyUpdateService],
    controllers: [],
})
export class SbModule { }
