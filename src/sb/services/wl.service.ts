import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService } from 'src/common/logger.service';
import { CacheService } from 'src/cache/cache.service';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { BookmakerWLDto, WhiteLabel } from 'src/model/whiteLabel';
import configuration from 'src/configuration';
import { BookmakerMarket } from 'src/model/bookmaker';
const BOOKMARKER_REDIS_FIELD = "bookmaker_ids"
@Injectable()
export class WhiteLabelService implements OnModuleInit {

    private activeWhiteLabels: WhiteLabel[] = [];

    constructor(
        private readonly cacheService: CacheService,
        private logger: LoggerService,
        private configService: ConfigService,
    ) { }

    async onModuleInit() {
        await this.fetchActiveWhiteLabels();
    }

    async fetchActiveWhiteLabels() {
        try {
            const response = await axios.get(`${this.configService.get('API_SERVER_URL')}/v1/api/white_label/active`);
            if (response?.data?.result?.length)
                this.activeWhiteLabels = response?.data?.result as WhiteLabel[];
        } catch (error) {
            this.logger.error(`Error fetching active white labels: ${error.message}`, WhiteLabelService.name);
        }
    }
    getActiveWhiteLabelsId(): number[] {
        return this.activeWhiteLabels?.map(wl => wl.ID);
    }


    private async getWhiteLabeBookMaker(domainName: string): Promise<BookmakerWLDto> {
        try {
            if (!domainName) return null;
            const redisResponse = await this.cacheService.hGet(
                configuration.redisPubClientFE, domainName, BOOKMARKER_REDIS_FIELD);
            if (redisResponse) return JSON.parse(redisResponse) as BookmakerWLDto;
            const apiUrl = `${this.configService.get('SB_REST_SERVER_URL')}/sb/bm/white-label-bookmaker/${domainName}`;
            const { data } = await axios.get(apiUrl);
            if (data?.message == "Success") return data?.data as BookmakerWLDto;
            return null;
        } catch (error) {
            this.logger.error(
                `Error fetching white label's bookmaker for domain '${domainName}': ${error.message}`,
                WhiteLabelService.name
            );
        }
    }

    async filterWLBookmakers(
        id: number,
        bookmakerDataList: BookmakerMarket[],
    ): Promise<BookmakerMarket[]> {
        const domainName = this.activeWhiteLabels.find(wl => wl.ID === id)?.DOMAIN_NAME;
        if (!domainName) {
            this.logger.error(`White label with ID '${id}' not found`, WhiteLabelService.name);
            return [];
        }
        try {
            const whiteLabelData = await this.getWhiteLabeBookMaker(domainName);
            if (!whiteLabelData) {
                return [];
            }

            const { active_bookmakers, inactive_bookmakers } = whiteLabelData;
            return bookmakerDataList.filter(bookmaker =>
                active_bookmakers.includes(bookmaker.providerId) &&
                !inactive_bookmakers.includes(bookmaker.providerId)
            );
        } catch (error) {
            this.logger.error(
                `Error fetching white label's bookmaker for domain '${domainName}': ${error.message}`,
                WhiteLabelService.name
            );
            return [];
        }
    }
}
