import { Module } from '@nestjs/common';
import { FrameworkService } from './framework.service';
import { FrameworkController } from './framework.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FrameworkService],
  controllers: [FrameworkController],
  exports: [FrameworkService],
})
export class FrameworkModule {}
