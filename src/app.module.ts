import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { SbModule } from './sb/sb.module';

@Module({
  imports: [SbModule, ConfigModule.forRoot({ isGlobal: true }),],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
