
import { Injectable, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { LoggerService } from 'src/common/logger.service';
import { SIDE } from 'src/model';
import { BookmakerRunner, BookmakerRunnerStaus, BookmakerStaus } from 'src/model/bookmaker';
import { FancyMarketRunner, FancyRunnerStaus } from 'src/model/fancy.market';
import { PendingBet } from 'src/model/penndigBet';
import { generateGUID } from 'src/utlities';

@Injectable()
export class SettlementService {

    constructor(
        private configService: ConfigService,
        private logger: LoggerService
    ) { }


    async fancyBetSettlement(marketId: string, runner: FancyMarketRunner) {
        try {
            if (!(runner.status == FancyRunnerStaus.REMOVED || runner.status == FancyRunnerStaus.CLOSED)) return
            const penndingBets = await this.getPendingBets(marketId, runner.selectionId)
            if (penndingBets?.length == 0) return;
            for (let i = 0; i < penndingBets.length; i++) {
                if (runner.status == FancyRunnerStaus.REMOVED) {
                    await this.betVoided(penndingBets[i].ID);
                } else {
                    if (
                        (penndingBets[i].SIDE == SIDE.BACK && runner?.priceResult && runner?.priceResult >= penndingBets[i].PRICE) ||
                        (penndingBets[i].SIDE == SIDE.LAY && runner?.priceResult && runner?.priceResult < penndingBets[i].PRICE)
                    )
                        await this.betSettlement(penndingBets[i].ID, 1, penndingBets[i].SIZE)
                    else
                        await this.betSettlement(penndingBets[i].ID, 0, penndingBets[i].SIZE)
                }
            }
        } catch (error) {
            console.log(error);
            this.logger.error(`Error on  check fancy bet settlement: ${error.message}`, SettlementService.name);
        }
    }





    async bookMakerBetSettlement(marketId: string, runner: BookmakerRunner, bookmakerStatus: BookmakerStaus) {
        try {
            if (!(bookmakerStatus == BookmakerStaus.REMOVED || bookmakerStatus == BookmakerStaus.CLOSED)) return
            const penndingBets = await this.getPendingBets(marketId, runner.selectionId)
            if (penndingBets?.length == 0) return;

            for (let i = 0; i < penndingBets.length; i++) {
                if (bookmakerStatus == BookmakerStaus.REMOVED) {
                    await this.betVoided(penndingBets[i].ID);
                } else
                    if (runner.status == BookmakerRunnerStaus.WINNER) {
                        await this.betSettlement(penndingBets[i].ID, penndingBets[i].SIDE == SIDE.BACK ? 1 : 0, runner.backVolume);
                    } else if (runner.status == BookmakerRunnerStaus.LOSER) {
                        await this.betSettlement(penndingBets[i].ID, penndingBets[i].SIDE == SIDE.LAY ? 1 : 0, runner.backVolume);
                    } else if (runner.status == BookmakerRunnerStaus.REMOVED) {
                        await this.betVoided(penndingBets[i].ID);
                    }
            }

        } catch (error) {
            console.log(error);
            this.logger.error(`Error on  check book maker bet settlement: ${error.message}`, SettlementService.name);
        }
    }




    private async getPendingBets(marketId: string, selectionId) {
        try {
            const penndingBetsResponse = await axios.get(`${this.configService.get("API_SERVER_URL")}/v1/api/bf_placebet/pending_by_market/${marketId}/${selectionId}`);
            const penndingBets = (penndingBetsResponse?.data?.result || []) as PendingBet[];
            return penndingBets;
        } catch (error) {
            this.logger.error(`Error get pending Bets from api service ${error.message}`, SettlementService.name);
        }
    }


    private async betSettlement(BF_PLACEBET_ID, RESULT: 0 | 1, BF_SIZE: number) {
        try {
            const BF_BET_ID = generateGUID();
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

}




