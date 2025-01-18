
import { Injectable, OnModuleInit, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { LoggerService } from 'src/common/logger.service';
import { BettingType, SIDE } from 'src/model';
import { BookmakerMarket, BookmakerRunner, BookmakerRunnerStaus, BookmakerStaus } from 'src/model/bookmaker';
import { FancyMarket, FancyMarketRunner, FancyRunnerStaus } from 'src/model/fancy.market';
import { PendingBet } from 'src/model/penndigBet';
import { Cron } from '@nestjs/schedule';
import { CacheService } from 'src/cache/cache.service';
import { CachedKeys } from 'src/common/cachedKeys';
import configuration from 'src/configuration';

const { dragonflyClient, sbHashKey } = configuration;
@Injectable()
export class SettlementService implements OnModuleInit {

    constructor(
        private configService: ConfigService,
        private logger: LoggerService,
        private readonly cacheService: CacheService,
    ) { }
    async onModuleInit() {
        await this.checkSettlementOfBet();
    }


    async fancyBetSettlement(marketId: string, providerId, runner: FancyMarketRunner) {
        try {
            const penndingBets = await this.getPendingBets(marketId, providerId, runner.selectionId)
            if (penndingBets?.length == 0) return;
            for (let i = 0; i < penndingBets.length; i++) {
                if (runner.status == FancyRunnerStaus.REMOVED) {
                    await this.betVoided(penndingBets[i].ID);
                } else {
                    if (
                        (penndingBets[i].SIDE == SIDE.BACK && runner?.priceResult && runner?.priceResult >= penndingBets[i].PRICE) ||
                        (penndingBets[i].SIDE == SIDE.LAY && runner?.priceResult && runner?.priceResult < penndingBets[i].PRICE)
                    )
                        await this.betSettlement(penndingBets[i].ID, 1, penndingBets[i].SIZE, penndingBets[i].BF_BET_ID)
                    else
                        await this.betSettlement(penndingBets[i].ID, 0, penndingBets[i].SIZE, penndingBets[i].BF_BET_ID)
                }
            }
        } catch (error) {
            console.log(error);
            this.logger.error(`Error on  check fancy bet settlement: ${error.message}`, SettlementService.name);
        }
    }





    async bookMakerBetSettlement(marketId: string, providerId, runner: BookmakerRunner, bookmakerStatus: BookmakerStaus) {
        try {
            const penndingBets = await this.getPendingBets(marketId, providerId, runner.selectionId)
            if (penndingBets?.length == 0) return;

            for (let i = 0; i < penndingBets.length; i++) {
                if (bookmakerStatus == BookmakerStaus.REMOVED) {
                    await this.betVoided(penndingBets[i].ID);
                } else
                    if (runner.status == BookmakerRunnerStaus.WINNER) {
                        await this.betSettlement(penndingBets[i].ID, penndingBets[i].SIDE == SIDE.BACK ? 1 : 0, runner.backVolume, penndingBets[i].BF_BET_ID);
                    } else if (runner.status == BookmakerRunnerStaus.LOSER) {
                        await this.betSettlement(penndingBets[i].ID, penndingBets[i].SIDE == SIDE.LAY ? 1 : 0, runner.backVolume, penndingBets[i].BF_BET_ID);
                    } else if (runner.status == BookmakerRunnerStaus.REMOVED) {
                        await this.betVoided(penndingBets[i].ID);
                    }
            }

        } catch (error) {
            console.log(error);
            this.logger.error(`Error on  check book maker bet settlement: ${error.message}`, SettlementService.name);
        }
    }




    private async getPendingBets(marketId: string, providerId, selectionId) {
        try {
            const penndingBetsResponse = await axios.get(`${this.configService.get("API_SERVER_URL")}/v1/api/sb_placebet/pending_market/${marketId}/${selectionId}/${providerId}`);
            const penndingBets = (penndingBetsResponse?.data?.result || []) as PendingBet[];
            console.log('get pending bet  for', marketId, providerId, selectionId, penndingBets)
            return penndingBets;
        } catch (error) {
            this.logger.error(`Error get pending Bets from api service ${error.message}`, SettlementService.name);
        }
    }


    private async betSettlement(BF_PLACEBET_ID, RESULT: 0 | 1, BF_SIZE: number, BF_BET_ID) {
        try {
            BF_PLACEBET_ID
            const respose = (await axios.post(`${this.configService.get("API_SERVER_URL")}/v1/api/sb_settlement`, { BF_BET_ID, BF_PLACEBET_ID, RESULT, BF_SIZE }))?.data;
            if (!respose?.result || respose?.status == "error") {
                this.logger.error(`Error on  bet settlement: ${respose?.status}`, SettlementService.name);
            }
            else
                this.logger.info(`uplace bet Settlement , place bet id: ${BF_PLACEBET_ID}  `, SettlementService.name);
        } catch (error) {
            this.logger.error(`Error on book maker bet settlement: ${error.message}`, SettlementService.name);
        }
    }


    private async betVoided(ID) {
        try {
            const respose = (await axios.post(`${process.env.API_SERVER_URL}/v1/api/sb_placebet/status`,
                { ID, STATUS: 'VOIDED' }))?.data;

            if (!respose?.result || respose?.status == "error") {
                this.logger.error(`Error on  bet settlement: ${respose?.status}`, SettlementService.name);
            }
            else
                this.logger.info(`update place bet to Voided , place bet id: ${ID} response `, SettlementService.name);

        } catch (error) {
            this.logger.error(`Error on bet voided : ${error.message}`, SettlementService.name);
        }

    }

    //  @Cron(`*/5 * * * *`)
    private async checkSettlementOfBet() {

        try {
            const respose = (await axios.get(`${process.env.API_SERVER_URL}/v1/api/sb_placebet/pending`))?.data;

            if (!respose?.result || respose?.status == "error") {
                this.logger.error(`Error on get SB pennding  bets on check settlement : ${respose?.status}`, SettlementService.name);
            }
            else {
                const penndingBets = (respose?.result || []) as PendingBet[];
                for (let i = 0; i < penndingBets.length; i++) {
                    const bet = penndingBets[i];
                    if (bet.BETTING_TYPE == BettingType.BOOKMAKER) {
                        const field = CachedKeys.getBookMakerHashField(bet.EVENT_ID, bet.SERVICE_ID, bet.PROVIDER_ID);
                        const bookMakerMarketHash = await this.cacheService.hGet(dragonflyClient, sbHashKey, field);
                        const bookMaker = bookMakerMarketHash ? JSON.parse(bookMakerMarketHash) as BookmakerMarket : null;
                        if (bookMaker) {
                            const runner = bookMaker.runners.find(runner => runner.selectionId == bet.SELECTION_ID)
                            if (runner)
                                await this.bookMakerBetSettlement(bookMaker.marketId, bookMaker.providerId, runner, bookMaker.status)
                        }
                    }
                    else if (bet.BETTING_TYPE == BettingType.FANCY) {
                        const field = CachedKeys.getFancyHashField(bet.EVENT_ID, bet.SERVICE_ID, bet.PROVIDER_ID);
                        const fancyMarketHash = await this.cacheService.hGet(dragonflyClient, sbHashKey, field);
                        const fancy = fancyMarketHash ? JSON.parse(fancyMarketHash) as FancyMarket : null;
                        if (fancy) {
                            const runner = fancy.runners.find(runner => runner.selectionId == bet.SELECTION_ID)
                            if (runner)
                                await this.fancyBetSettlement(fancy.marketId, fancy.providerId, runner)
                        }
                    }

                }

            }

        } catch (error) {
            this.logger.error(`Error on check settlement Of Bet : ${error.message}`, SettlementService.name);
        }

    }

}




