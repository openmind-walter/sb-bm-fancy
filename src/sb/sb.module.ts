import { Module } from '@nestjs/common';
import { LoggerService } from 'src/common/logger.service';
import { BookMakerUpdateService } from './services/bookmaker.update.service';
import { FancyUpdateService } from './services/fancy.update.service';
import { CacheModule } from 'src/cache/cache.module';
import { WhiteLabelService } from './services/wl.service';




@Module({
    imports: [CacheModule],
    providers: [LoggerService, WhiteLabelService, BookMakerUpdateService,
        FancyUpdateService],

})
export class SbModule { }
