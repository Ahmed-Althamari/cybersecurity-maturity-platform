import { Module } from '@nestjs/common';

import { AssessmentsModule } from '../assessments/assessments.module';
import { PrismaModule } from '../prisma/prisma.module';

import { RemediationInitiativesController } from './remediation-initiatives.controller';
import { RemediationInitiativesService } from './remediation-initiatives.service';

@Module({
  imports: [PrismaModule, AssessmentsModule],
  providers: [RemediationInitiativesService],
  controllers: [RemediationInitiativesController],
  exports: [RemediationInitiativesService],
})
export class RemediationInitiativesModule {}
