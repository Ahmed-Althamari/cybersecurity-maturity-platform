import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { StrategicInitiativesController } from './strategic-initiatives.controller';
import { StrategicInitiativesService } from './strategic-initiatives.service';

@Module({
  imports: [PrismaModule],
  providers: [StrategicInitiativesService],
  controllers: [StrategicInitiativesController],
  exports: [StrategicInitiativesService],
})
export class StrategicInitiativesModule {}
