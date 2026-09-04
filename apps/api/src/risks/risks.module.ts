import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { RisksController } from './risks.controller';
import { RisksService } from './risks.service';

@Module({
  imports: [PrismaModule],
  providers: [RisksService],
  controllers: [RisksController],
  exports: [RisksService],
})
export class RisksModule {}
