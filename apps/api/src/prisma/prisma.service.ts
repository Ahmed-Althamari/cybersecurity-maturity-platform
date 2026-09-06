import { PrismaClient } from '@cmmp/database';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private logger = new Logger('PrismaService');

  // Prisma 7 requires every PrismaClient instance to be constructed with a driver
  // adapter (or an Accelerate URL) -- see packages/database/prisma/seed.ts for the
  // seed script's own equivalent.
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Database connection established');
    } catch (error) {
      this.logger.error('❌ Database connection failed', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('✅ Database connection closed');
    } catch (error) {
      this.logger.error('❌ Database disconnection error', error);
    }
  }
}
