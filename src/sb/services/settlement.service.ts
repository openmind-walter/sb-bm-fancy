
import { Injectable, OnModuleDestroy, OnModuleInit, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { LoggerService } from 'src/common/logger.service';
import { BettingType, SIDE } from 'src/model';
import { BookmakerMarket, BookmakerRunner, BookmakerRunnerStaus, BookmakerStaus } from 'src/model/bookmaker';
import { FancyMarketRunner, FancyRunnerStaus } from 'src/model/fancy.market';
import { PendingBet } from 'src/model/penndigBet';
import { CacheService } from 'src/cache/cache.service';
import { CachedKeys } from 'src/common/cachedKeys';
import configuration from 'src/configuration';
import { MarketOutcome } from 'src/model/Marketoutcome';
import { EventResult } from 'src/model/eventResult';

enum SettlementResult {
    'WON' = "WON",
    "LOST" = "LOST",
    "VOIDED" = "VOIDED"
}

const { dragonflyClient, sbHashKey } = configuration;
@Injectable()
export class SettlementService implements OnModuleInit, OnModuleDestroy {
    private fancyOutComeUpdateInterval: NodeJS.Timeout;
    // private bookMakerOutComeUpdateInterval: NodeJS.Timeout;

    constructor(
        private configService: ConfigService,
        private logger: LoggerService,
        private readonly cacheService: CacheService,
    ) { }
    async onModuleInit() {
        await this.checkBookMakerSettlement();
        this.fancyOutComeUpdateInterval = setInterval(() => this.checkFancyOutcome(), 60000);
        // this.bookMakerOutComeUpdateInterval = setInterval(() => this.checkBookMakerSettlement(), 55000);
    }
    onModuleDestroy() {
        clearInterval(this.fancyOutComeUpdateInterval);
        // clearInterval(this.bookMakerOutComeUpdateInterval);
    }

    // Unused code, will be called in the future need when the fancy market is closed or voided.
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
                        (penndingBets[i].SIDE == SIDE.BACK && runner?.priceResult && penndingBets[i].PRICE >= runner?.priceResult) ||
                        (penndingBets[i].SIDE == SIDE.LAY && runner?.priceResult && penndingBets[i].PRICE < runner?.priceResult)
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
            for (const bet of penndingBets) {
                const betId = bet?.ID;
                const eventId = bet?.EVENT_ID;
                const selectionId = bet?.SELECTION_ID;
                const side = bet?.SIDE;

                try {
                    switch (true) {
                        case bookmakerStatus == BookmakerStaus.REMOVED:
                        case runner.status == BookmakerRunnerStaus.REMOVED:
                            this.logger.info(
                                `on bookmaker bet settlementvoided: ID=${betId}, Side=${side}, Event=${eventId}, Selection=${selectionId}`,
                                SettlementService.name
                            );
                            await this.betVoided(betId);
                            break;

                        case runner.status == BookmakerRunnerStaus.WINNER:
                            const resultWin = side == SIDE.BACK ? SettlementResult.WON : SettlementResult.LOST;
                            this.logger.info(
                                `on bookmaker bet settlement: ID=${betId}, Side=${side}, Result=${resultWin}, Event=${eventId}, Selection=${selectionId}`,
                                SettlementService.name
                            );
                            await this.betSettlement(bet.BF_BET_ID, resultWin);
                            break;

                        case runner.status == BookmakerRunnerStaus.LOSER:
                            const resultLose = side == SIDE.LAY ? SettlementResult.WON : SettlementResult.LOST;
                            this.logger.info(
                                `on bookmaker bet settlement: ID=${betId}, Side=${side}, Result=${resultLose}, Event=${eventId}, Selection=${selectionId}`,
                                SettlementService.name
                            );
                            await this.betSettlement(bet.BF_BET_ID, resultLose);
                            break;

                        default:
                            this.logger.info(
                                `Unhandled status for bet ID=${betId}`,
                                SettlementService.name
                            );
                    }
                } catch (error) {
                    this.logger.error(`Error processing bet ID=${betId}: ${error}`, SettlementService.name);
                }
            }


        } catch (error) {
            console.log(error);
            this.logger.error(`Error on  check book maker bet settlement ${error.message}`, SettlementService.name);
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
        } catch (error) {
            this.logger.error(`Error on  bet settlement bf bet id ${BF_BET_ID} ${error?.message}`, SettlementService.name);
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


    private async checkBookMakerSettlement() {

        try {
            const respose = (await axios.get(`${process.env.API_SERVER_URL}/v1/api/sb_placebet/pending/by_betting_type/${BettingType.BOOKMAKER}`))?.data;
            if (!respose?.result || respose?.status == "error") {
                this.logger.error(`Error on get SB pennding  bets from DB on check settlement : ${respose?.status}`, SettlementService.name);
            }
            else {
                const penndingBets = (respose?.result || []) as PendingBet[];
                for (const bet of penndingBets) {
                    const field = CachedKeys.getBookMakerHashField(bet.EVENT_ID, bet.SERVICE_ID, bet.PROVIDER_ID);
                    const bookMakerMarketHash = await this.cacheService.hGet(dragonflyClient, sbHashKey, field);
                    const bookMaker = bookMakerMarketHash ? JSON.parse(bookMakerMarketHash) as BookmakerMarket : null;
                    if (bookMaker) {
                        const runner = bookMaker.runners.find(runner => runner.selectionId == bet.SELECTION_ID)
                        if (runner)
                            await this.bookMakerBetSettlement(bookMaker.marketId, bookMaker.providerId, runner, bookMaker.status, [bet])
                    } else
                        this.logger.error(`bookMaker maket not found from cache id: ${bet?.ID}, event id : ${bet?.EVENT_ID} , selection id: ${bet?.SELECTION_ID} , market id ${bet.MARKET_ID}`, SettlementService.name);
                }
            }
        } catch (error) {
            this.logger.error(`Error on check settlement Of Bet : ${error.message}`, SettlementService.name);
        }
    }



    async checkFancyOutcome() {
        try {
            const respose = (await axios.get(`${process.env.API_SERVER_URL}/v1/api/sb_placebet/pending/by_betting_type/${BettingType.FANCY}`))?.data;

            if (!respose?.result || respose?.status == "error") {
                this.logger.error(`Error on get SB pennding  bets from DB on check settlement : ${respose?.status}`, SettlementService.name);
            }
            else {
                const penndingFancyBets = (respose?.result || []) as PendingBet[];
                // this.logger.info(`Check fancy Settlement : ${penndingFancyBets?.length}`, SettlementService.name);
                if (penndingFancyBets?.length == 0) return;
                const marketOutComes = await this.getMarketOutCome();
                if (marketOutComes?.length == 0) return;

                for (const bet of penndingFancyBets) {
                    const marketOutCome = marketOutComes.find(m => m?.event_id == Number(bet?.EVENT_ID) && m?.market_id == bet?.SELECTION_ID)
                    if (marketOutCome) {
                        const result = Number(marketOutCome.result);
                        const price = Number(bet.PRICE);
                        if (result == -1) {
                            this.logger.info(`on fancy bet settlement id: ${bet?.ID}, side: ${bet?.SIDE} ,price: ${bet?.PRICE} , outcome result : ${marketOutCome.result} ,result ${SettlementResult.VOIDED}, event id ${bet?.EVENT_ID} ,selection id ${bet?.SELECTION_ID} `, SettlementService.name)
                            await this.betVoided(bet.ID)
                        } else if (
                            (bet.SIDE == SIDE.BACK && price >= result) ||
                            (bet.SIDE == SIDE.LAY && price < result)) {
                            this.logger.info(`on fancy bet settlement id: ${bet?.ID}, side: ${bet?.SIDE} ,price: ${bet?.PRICE} , outcome result : ${marketOutCome.result} ,result ${SettlementResult.WON}, event id ${bet?.EVENT_ID} ,selection id ${bet?.SELECTION_ID} `, SettlementService.name)
                            await this.betSettlement(bet.BF_BET_ID, SettlementResult.WON)
                        }
                        else {
                            this.logger.info(`on fancy bet settlement id: ${bet?.ID} ,side: ${bet?.SIDE}, price: ${bet?.PRICE} , outcome result : ${marketOutCome.result} ,result ${SettlementResult.LOST}, event id ${bet?.EVENT_ID} ,selection id ${bet?.SELECTION_ID} `, SettlementService.name)
                            await this.betSettlement(bet.BF_BET_ID, SettlementResult.LOST)
                        }
                    }

                }

            }

        } catch (error) {
            this.logger.error(`Error on check fancy settlement  : ${error.message}`, SettlementService.name);
        }


    }

    async getMarketOutCome() {
        try {

            const outcomeResponse = (await axios.get(`${this.configService.get("PROVIDER_SB_ENDPOINT")}/get-latest-results`))?.data;
            if (outcomeResponse?.status == 200)
                return outcomeResponse?.data as MarketOutcome[];
            else {
                this.logger.error(`Error on  get  market outcome from provider SB : ${outcomeResponse}`, SettlementService.name);
                return []
            }
        } catch (error) {
            this.logger.error(`Error on  get  market outcome from provider SB: ${error.message}`, SettlementService.name);
        }

    }

    async saveSettlementResult(EVENT_ID: string, MARKET_ID: string, SELECTION_ID: number, PROVIDER_ID, RESULT: string) {

        try {
            const closed_time = new Date().toISOString();
            const eventResult = new EventResult(EVENT_ID, MARKET_ID, SELECTION_ID, PROVIDER_ID, 'SB', closed_time, RESULT)
            const url = `${process.env.API_SERVER_URL}/v1/api/events_result`;
            const response = await axios.post(url, eventResult)
            if (response?.data.status != 'ok') {
                this.logger.error(`Error on  saveSettlementResult: ${response?.data} ,${JSON.stringify(eventResult)}`, SettlementService.name);
            }
        } catch (error) {
            this.logger.error(`Error on  saveSettlementResult: ${error}`, SettlementService.name);
        }

    }

}




