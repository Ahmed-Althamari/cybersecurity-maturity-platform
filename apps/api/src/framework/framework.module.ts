import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { FrameworkController } from './framework.controller';
import { FrameworkService } from './framework.service';

@Module({
  imports: [PrismaModule],
  providers: [FrameworkService],
  controllers: [FrameworkController],
  exports: [FrameworkService],
})
export class FrameworkModule {}
