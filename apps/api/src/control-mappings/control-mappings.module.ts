import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { ControlMappingsController } from './control-mappings.controller';
import { ControlMappingsService } from './control-mappings.service';

@Module({
  imports: [PrismaModule],
  providers: [ControlMappingsService],
  controllers: [ControlMappingsController],
  exports: [ControlMappingsService],
})
export class ControlMappingsModule {}
