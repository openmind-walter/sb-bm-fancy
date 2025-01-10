// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// // import { AppClusterService } from './app_cluster.service';
// // import { CacheService } from './cache/cache.service';
// // import configuration from './configuration';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);

//   // const cacheService = new CacheService();
//   // await cacheService.del(configuration.dragonflyPubClient, configuration.sbTasksBookMaker);
//   // await cacheService.del(configuration.dragonflyPubClient, configuration.sbtasksfancy);

//   await app.listen(4500);
// }
// bootstrap();

// // AppClusterService.clusterize(bootstrap);


import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
async function bootstrap() {

  const app = process.env.DEV_ENV ? await NestFactory.create(AppModule) :
    await NestFactory.create(AppModule, {});
  app.enableCors();
  await app.listen(process.env.SERVER_PORT || 4500);
}
bootstrap();
