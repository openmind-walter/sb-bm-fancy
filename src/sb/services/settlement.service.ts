
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
import { MarketOutcome } from 'src/model/Marketoutcome';

enum SettlementResult {
    'WON' = "WON",
    "LOST" = "LOST"
}

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
        await this.checkFancyOutcome();
    }


    async fancyBetSettlement(marketId: string, providerId, runner: FancyMarketRunner, pendingPlaceBets?: PendingBet[]) {
        try {
            if (!(runner?.status == FancyRunnerStaus.CLOSED || runner?.priceResult || runner.status == FancyRunnerStaus.REMOVED))
                return;
            this.logger.info(`on fancy bet settlement called  selection id : ${runner.selectionId}  marketid: ${marketId} `, SettlementService.name);
            const penndingBets = pendingPlaceBets ? pendingPlaceBets : await this.getPendingBets(marketId, providerId, runner.selectionId);
            this.logger.info(`on fancy bet settlement  ${penndingBets?.length} pennding bets  `, SettlementService.name);
            if (penndingBets?.length == 0) return;
            for (let i = 0; i < penndingBets.length; i++) {
                if (runner.status == FancyRunnerStaus.REMOVED) {
                    await this.betVoided(penndingBets[i].ID);
                } else {
                    if (
                        (penndingBets[i].SIDE == SIDE.BACK && runner?.priceResult && runner?.priceResult >= penndingBets[i].PRICE) ||
                        (penndingBets[i].SIDE == SIDE.LAY && runner?.priceResult && runner?.priceResult < penndingBets[i].PRICE)
                    )
                        await this.betSettlement(penndingBets[i].BF_BET_ID, SettlementResult.WON)
                    else if (runner?.priceResult)
                        await this.betSettlement(penndingBets[i].BF_BET_ID, SettlementResult.LOST)
                    else
                        this.logger.error(`fancy market closed but got null result for bet event id ${penndingBets[i]?.EVENT_ID} ,id ${penndingBets[i]?.ID} selection id ${penndingBets[i]?.SELECTION_ID}`, SettlementService.name)
                }
            }
        } catch (error) {
            console.log(error);
            this.logger.error(`Error on  check fancy bet settlement: ${error.message}`, SettlementService.name);
        }
    }





    async bookMakerBetSettlement(marketId: string, providerId, runner: BookmakerRunner, bookmakerStatus: BookmakerStaus, pendingPlaceBets?: PendingBet[]) {
        try {

            if (!(runner.status == BookmakerRunnerStaus.LOSER || runner.status == BookmakerRunnerStaus.WINNER
                || runner.status == BookmakerRunnerStaus.REMOVED)) return;

            const penndingBets = pendingPlaceBets ? pendingPlaceBets : await this.getPendingBets(marketId, providerId, runner.selectionId);
            if (penndingBets?.length == 0) return;
            this.logger.info(`on  bookMaker bet settlement  ${penndingBets?.length} pennding bets  `, SettlementService.name);
            for (let i = 0; i < penndingBets.length; i++) {
                if (bookmakerStatus == BookmakerStaus.REMOVED) {
                    await this.betVoided(penndingBets[i].ID);
                } else
                    if (runner.status == BookmakerRunnerStaus.WINNER) {
                        await this.betSettlement(penndingBets[i].BF_BET_ID, penndingBets[i].SIDE == SIDE.BACK ? SettlementResult.WON : SettlementResult.LOST);
                    } else if (runner.status == BookmakerRunnerStaus.LOSER) {
                        await this.betSettlement(penndingBets[i].BF_BET_ID, penndingBets[i].SIDE == SIDE.LAY ? SettlementResult.WON : SettlementResult.LOST);
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
            if (!penndingBetsResponse?.data.result || penndingBetsResponse?.data?.status == "error") {
                this.logger.error(`Error on get pending bets: ${penndingBetsResponse?.data.result}`, SettlementService.name);
            }

            const penndingBets = (penndingBetsResponse?.data?.result || []) as PendingBet[];
            return penndingBets;
        } catch (error) {
            this.logger.error(`Error get pending Bets from api service ${error.message}`, SettlementService.name);
        }
    }


    private async betSettlement(BF_BET_ID, RESULT: SettlementResult) {
        try {
            const respose = (await axios.post(`${this.configService.get("API_SERVER_URL")}/v1/api/sb_placebet/status/update_settled`, { BF_BET_ID, RESULT }))?.data;
            if (!respose?.result || respose?.status == "error") {
                this.logger.error(`Error on  bet settlement: ${respose?.status}`, SettlementService.name);
            }
            else
                this.logger.info(`update bet Settlement  bf_ bet id: ${BF_BET_ID}  `, SettlementService.name);
        } catch (error) {
            this.logger.error(`Error on  bet settlement: ${error.message}`, SettlementService.name);
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


    private async checkSettlementOfBet() {

        try {
            const respose = (await axios.get(`${process.env.API_SERVER_URL}/v1/api/sb_placebet/pending`))?.data;
            if (!respose?.result || respose?.status == "error") {
                this.logger.error(`Error on get SB pennding  bets from DB on check settlement : ${respose?.status}`, SettlementService.name);
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
                                await this.bookMakerBetSettlement(bookMaker.marketId, bookMaker.providerId, runner, bookMaker.status, [penndingBets[i]])
                        } else
                            this.logger.error(`bookMaker maket not found from cache id: ${bet?.ID}, event id : ${bet?.EVENT_ID} , selection id: ${bet?.SELECTION_ID} , market id ${bet.MARKET_ID}`, SettlementService.name)

                    }
                    else if (bet.BETTING_TYPE == BettingType.FANCY) {
                        // const field = CachedKeys.getFancyHashField(bet.EVENT_ID, bet.SERVICE_ID, bet.PROVIDER_ID);
                        // const fancyMarketHash = await this.cacheService.hGet(dragonflyClient, sbHashKey, field);
                        // const fancy = fancyMarketHash ? JSON.parse(fancyMarketHash) as FancyMarket : null;
                        // if (fancy) {
                        //     const runner = fancy.runners.find(runner => runner.selectionId == bet.SELECTION_ID)
                        //     if (runner)
                        //         await this.fancyBetSettlement(fancy.marketId, fancy.providerId, runner, [penndingBets[i]])
                        // }
                        // else
                        //     this.logger.error(`fancy maket not found from cache id: ${bet?.ID}, event id : ${bet?.EVENT_ID} , selection id: ${bet?.SELECTION_ID} , market id ${bet?.MARKET_ID}`, SettlementService.name)
                    }

                }
            }
        } catch (error) {
            this.logger.error(`Error on check settlement Of Bet : ${error.message}`, SettlementService.name);
        }
    }
    @Cron('0 */1 * * *')
    async checkFancyOutcome() {
        try {
            const respose = (await axios.get(`${process.env.API_SERVER_URL}/v1/api/sb_placebet/pending/by_betting_type/${BettingType.FANCY}`))?.data;

            if (!respose?.result || respose?.status == "error") {
                this.logger.error(`Error on get SB pennding  bets from DB on check settlement : ${respose?.status}`, SettlementService.name);
            }
            else {
                const penndingFancyBets = (respose?.result || []) as PendingBet[];
                this.logger.info(`Check fancy Settlement : ${penndingFancyBets?.length}`, SettlementService.name);
                if (penndingFancyBets?.length == 0) return;
                const marketOutComes = await this.getMarketOutCome();
                if (marketOutComes?.length == 0) return;

                for (let i = 0; i < penndingFancyBets?.length; i++) {
                    const bet = penndingFancyBets[i];
                    const marketOutCome = marketOutComes.find(m => m.event_id == Number(bet.EVENT_ID) && `${m.market_id}` == bet.MARKET_ID)
                    if (marketOutCome) {
                        if (
                            (bet.SIDE == SIDE.BACK && marketOutCome.result && marketOutCome.result >= bet.PRICE) ||
                            (bet.SIDE == SIDE.LAY && marketOutCome.result && marketOutCome.result < bet.PRICE)
                        ) {
                            this.logger.info(`on fancy bet settlement id: ${bet?.ID} , outcome result : ${marketOutCome.result} ,result ${SettlementResult.WON}, event id ${bet?.EVENT_ID} ,selection id ${bet?.SELECTION_ID} `, SettlementService.name)
                            await this.betSettlement(bet.BF_BET_ID, SettlementResult.WON)
                        }
                        else if (marketOutCome.result) {
                            this.logger.info(`on fancy bet settlement id: ${bet?.ID} , outcome result : ${marketOutCome.result} ,result ${SettlementResult.LOST}, event id ${bet?.EVENT_ID} ,selection id ${bet?.SELECTION_ID} `, SettlementService.name)
                            await this.betSettlement(bet.BF_BET_ID, SettlementResult.LOST)
                        }
                        else
                            this.logger.error(`fancy market closed but got null result for bet event id ${bet?.EVENT_ID} from provider ,id ${bet?.ID} selection id ${bet?.SELECTION_ID}`, SettlementService.name)

                    }

                }

            }

        } catch (error) {
            this.logger.error(`Error on check settlement Of Bet : ${error.message}`, SettlementService.name);
        }


    }

    async getMarketOutCome() {
        try {

            const outcomeResponse = (await axios.get(`${this.configService.get("PROVIDER_SB_ENDPOINT")}/get-latest-results`))?.data;
            if (outcomeResponse?.status === 200)
                return outcomeResponse?.data as MarketOutcome[];
            else {
                this.logger.error(`Error on  get  market outcome from provider SB : ${outcomeResponse}`, SettlementService.name);
                return []
            }
        } catch (error) {
            this.logger.error(`Error on  get  market outcome from provider SB: ${error.message}`, SettlementService.name);
        }

    }

}




