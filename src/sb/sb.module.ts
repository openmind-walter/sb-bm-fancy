import { Module } from '@nestjs/common';
import { LoggerService } from 'src/common/logger.service';
import { BookMakerUpdateService } from './services/bookmaker.update.service';
import { FancyUpdateService } from './services/fancy.update.service';
import { CacheModule } from 'src/cache/cache.module';
import { WhiteLabelService } from './services/wl.service';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getSanitizedRedisUrl } from 'src/utlities';
import { SBUpdateService } from './services/sb.update.service';

@Module({
    imports: [
        CacheModule,
        BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                url: getSanitizedRedisUrl(configService.get<string>('DRAGONFLY_URL')),
                limiter: {
                    max: 1000,
                    duration: 60000,
                },
                isGlobal: true,
            }),
            inject: [ConfigService],
        }),
        BullModule.registerQueue(
            {
                name: 'bookMakerUpdate',
                defaultJobOptions: {
                    removeOnComplete: true,
                    removeOnFail: true,
                },
            },
            {
                name: 'fancyUpdate',
                defaultJobOptions: {
                    removeOnComplete: true,
                    removeOnFail: true,
                },
            }
        ),
    ],
    providers: [
        LoggerService,
        WhiteLabelService,
        BookMakerUpdateService,
        FancyUpdateService,
        SBUpdateService
    ],
})
export class SbModule { }
