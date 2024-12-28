import { Module } from '@nestjs/common';
import { CacheService } from 'src/cache/cache.service';

@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule { }
