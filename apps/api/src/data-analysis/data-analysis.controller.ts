import { MAX_FILE_SIZE_BYTES } from '@cmmp/import-engine';
import { BadRequestException, Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/authenticated-request';

import { AnalysisMode, DataAnalysisService } from './data-analysis.service';

const VALID_MODES: AnalysisMode[] = ['local', 'ai'];

/**
 * A new, isolated feature — not part of the assessments/risks/frameworks domain, and not
 * gated by @Roles: any authenticated tenant user can analyze a spreadsheet they upload here,
 * same as they could open it in a spreadsheet tool themselves.
 */
@ApiTags('Data Analysis')
@ApiBearerAuth()
@Controller('data-analysis')
@UseGuards(JwtAuthGuard)
export class DataAnalysisController {
  constructor(private dataAnalysisService: DataAnalysisService) {}

  @Post('sheets')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async sheets(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded (expected a multipart field named "file")');
    }
    return this.dataAnalysisService.getSheets(file);
  }

  @Post('analyze')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async analyze(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
    @Body('mode') mode?: string,
    @Body('question') question?: string,
    @Body('slot') slotRaw?: string,
    @Body('sheetName') sheetName?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded (expected a multipart field named "file")');
    }
    if (!VALID_MODES.includes(mode as AnalysisMode)) {
      throw new BadRequestException(`mode must be one of ${VALID_MODES.join(', ')}`);
    }
    // Which single configured provider to use for "ai" mode, instead of the default full
    // fallback chain (see the Data Analysis page's slot picker). Range/existence validated by
    // LlmSettingsService.resolveProviderChainForAnalysis.
    const slot = slotRaw ? Number(slotRaw) : undefined;
    return this.dataAnalysisService.analyze(file, mode as AnalysisMode, question, user.tenantId, slot, sheetName);
  }
}
