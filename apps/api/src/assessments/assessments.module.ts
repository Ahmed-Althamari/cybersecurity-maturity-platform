import { Module } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { AssessmentsController } from './assessments.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FrameworkModule } from '../framework/framework.module';

@Module({
  imports: [PrismaModule, FrameworkModule],
  providers: [AssessmentsService],
  controllers: [AssessmentsController],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
