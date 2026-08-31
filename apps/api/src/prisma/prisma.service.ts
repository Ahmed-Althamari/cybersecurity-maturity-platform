import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@cmmp/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private logger = new Logger('PrismaService');

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
