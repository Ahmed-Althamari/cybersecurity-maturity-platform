import { Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AssessmentsModule } from '../assessments/assessments.module';

@Module({
  imports: [PrismaModule, AssessmentsModule],
  providers: [ImportService],
  controllers: [ImportController],
})
export class ImportModule {}
