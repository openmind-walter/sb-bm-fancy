import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppClusterService } from './app_cluster.service';
import { CacheService } from './cache/cache.service';
import configuration from './configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const cacheService = new CacheService();
  await cacheService.del(configuration.dragonflyPubClient, configuration.sbTasksBookMaker);
  await cacheService.del(configuration.dragonflyPubClient, configuration.sbtasksfancy);

  await app.listen(4500);
}

AppClusterService.clusterize(bootstrap);