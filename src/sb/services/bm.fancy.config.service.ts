import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { Client } from 'pg';
import { LoggerService } from 'src/common/logger.service';
import { BookmakerFancyConfig, BookmakerFancyConfigUpdate } from 'src/model';
import { FancyMarket } from 'src/model/fancy.market';


@Injectable()
export class BmFancyConfigService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private minBetSize = 100;
  private maxBetSize = 20000;

  constructor(
    private logger: LoggerService
  ) {

  }

  async onModuleInit() {
    await this.getbookmakerFancyConfig()
    this.trackBMfacnyConfigChange()
  }

  async onModuleDestroy() {
    await this.client.end();
    console.log('Disconnected from PostgreSQL');
  }


  async trackBMfacnyConfigChange() {
    try {
      this.client = new Client({
        connectionString: process.env.POSTGRES_URL
      });
      await this.client.connect();

      this.client.on('notification', async (msg) => {
        if (msg.channel === 'bookmaker_fancy_config_update') {
          const payloadObject = JSON.parse(msg?.payload) as BookmakerFancyConfigUpdate;

          this.logger.info(`bookmaker_fancy_config_update: ${JSON.stringify(payloadObject)}`, BmFancyConfigService.name);

        }

      });
      await this.client.query('LISTEN bookmaker_fancy_config_update');

    } catch (err) {
      this.logger.error(` subscribe placebet databse notification : can't connect  to database`, BmFancyConfigService.name);
      process.exit(1);
    }

  }





  async getbookmakerFancyConfig() {
    try {
      const url = `${process.env.API_SERVER_URL}/v1/api/bookmaker_fancy_config`
      const response = await axios.get(url);
      if (response.data?.result?.length > 0) {
        const config = response.data?.result[0] as BookmakerFancyConfig;
        this.logger.info(`getbookmakerFancyConfig ${JSON.stringify(config)} `, BmFancyConfigService.name);
        this.minBetSize = config.MAX_BET_SIZE;
        this.maxBetSize = config.MAX_BET_SIZE;
        this.logger.info(`bookmakerFancyConfig min  max value updated ${JSON.stringify(config)} `, BmFancyConfigService.name);
      }
    } catch (err) {
      this.logger.error(`getbookmakerFancyConfig: ${err.message}`, BmFancyConfigService.name);

    }

  }


  upateMinMaxBetSizeFacyMarket(market: FancyMarket) {
    const runners = market.runners.map(runner => (
      { ...runner, minBetSize: this.minBetSize, maxBetSize: this.maxBetSize }
    ))
    return { ...market, runners }
  }


}








