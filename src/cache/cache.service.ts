import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import configuration from 'src/configuration';
import { formatToCustomDateString } from 'src/utlities';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private clients: { [name: string]: Redis } = {};

  constructor() {
    this.initializeClient(configuration.dragonflyClient, process.env.DRAGONFLY_URL);
    this.initializeClient(configuration.dragonflyPubClient, process.env.DRAGONFLY_URL);
    this.initializeClient(configuration.dragonflySubClient, process.env.DRAGONFLY_URL);
    this.initializeClient(configuration.redisPubClientFE, process.env.REDIS_FE_URL);
  }

  private initializeClient(clientName: string, url: string) {
    try {
      const client = new Redis(url);
      client.on('error', (err) => {
        console.error(`Cache client ${clientName} URL:${url} encountered an error:`, err);
      });
      this.clients[clientName] = client;
    } catch (err) {
      console.error(`Failed to initialize Cache client ${clientName} URL:${url}`, err);
    }
  }

  async get(client: string, key: string): Promise<string | null> {
    const redis = this.getClient(client);
    return redis ? await redis.get(key) : null;
  }

  async set(client: string, key: string, seconds: number, value: string): Promise<string | null> {
    const redis = this.getClient(client);
    return redis ? await redis.setex(key, seconds, value) : null;
  }

  async del(client: string, key: string): Promise<number> {
    const redis = this.getClient(client);
    return redis ? await redis.del(key) : 0;
  }

  async publish(client: string, channel: string, message: string): Promise<void> {
    const redis = this.getClient(client);
    if (redis) await redis.publish(channel, message);
  }

  async subscribe(client: string, channel: string, handler: (message: string) => void): Promise<void> {
    const redis = this.getClient(client);
    if (redis) {
      await redis.subscribe(channel);
      redis.on('message', (subChannel, message) => {
        if (subChannel === channel) {
          handler(message);
        }
      });
    }
  }

  async lpush(client: string, key: string, value: string): Promise<void> {
    const redis = this.getClient(client);
    if (redis) await redis.lpush(key, value);
  }

  async brpop(key: string, timeout: number): Promise<[string, string] | null> {
    const redis = this.getClient(configuration.dragonflySubClient);
    return redis ? await redis.brpop(key, timeout) : null;
  }

  async ltrim(client: string, key: string, start: number, stop: number): Promise<void> {
    const redis = this.getClient(client);
    if (redis) await redis.ltrim(key, start, stop);
  }

  async ldel(client: string, key: string): Promise<void> {
    const redis = this.getClient(client);
    if (redis) await redis.del(key);
  }

  private getClient(clientName: string): Redis {
    return this.clients[clientName];
  }

  async hset(client: string, key: string, field: string, value: string): Promise<void> {
    const redis = this.getClient(client);
    if (redis) await redis.hset(key, field, value);
  }

  async hGet(client: string, key: string, field: string): Promise<string | null> {
    const redis = this.getClient(client);
    return redis ? await redis.hget(key, field) : null;
  }

  async hDel(client: string, key: string, field: string): Promise<boolean> {
    const redis = this.getClient(client);
    if (redis) {
        const result = await redis.hdel(key, field);
        return result > 0; // hdel returns the number of fields removed, if any
    }
    return false;
}

  async onModuleDestroy() {
    for (const client of Object.values(this.clients)) {
      await client.quit();
    }
  }

  async getStream(client: string, callBack: (data: any[]) => void, streamName: string, lastId = '0'): Promise<void> {
    const redis = this.getClient(client);
    const groupName = "sb_group";

    if (!groupName || !streamName) {
      console.error(`${formatToCustomDateString(new Date())} Unable to get groupName or streamName`);
      return;
    }

    if (!redis) {
      console.error("Redis client is not provided");
      return;
    }

    while (true) {
      try {
        const messages = await redis.xread('STREAMS', streamName, lastId, 'BLOCK', '100', 'COUNT', '1000');
        if (messages) {
          const messageIds = [];
          const updates = [];

          for (const [stream, entries] of messages) {
            for (const [id, fields] of entries) {
              messageIds.push(id);

              const messageData = {};
              for (let i = 0; i < fields.length; i += 2) {
                messageData[fields[i]] = fields[i + 1];
              }
              updates.push(messageData);
            }
          }
          await callBack(updates);
          await redis.xack(streamName, groupName, ...messageIds);
          await redis.xdel(streamName, ...messageIds);
        }
      } catch (err) {
        console.error(`Error processing stream: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }


}
