import type { ColumnMapping, SpreadsheetFormat } from '@cmmp/import-engine';
import { UserRole } from '@cmmp/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

import { ImportService } from './import.service';

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5MB

@Controller('assessments/:id/import')
@UseGuards(JwtAuthGuard)
export class ImportController {
  constructor(private importService: ImportService) {}

  @Post('preview')
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.PLATFORM_ADMIN,
    UserRole.ORGANISATION_ADMIN,
    UserRole.CISO,
    UserRole.GRC_MANAGER,
    UserRole.ASSESSOR,
  )
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }))
  async previewImport(
    @Param('id') assessmentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('format') format: string | undefined,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded (expected multipart field 'file')");
    }
    if (format !== 'csv' && format !== 'xlsx') {
      throw new BadRequestException("'format' must be 'csv' or 'xlsx'");
    }
    return this.importService.previewSpreadsheet(user.tenantId, assessmentId, file, format as SpreadsheetFormat);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.PLATFORM_ADMIN,
    UserRole.ORGANISATION_ADMIN,
    UserRole.CISO,
    UserRole.GRC_MANAGER,
    UserRole.ASSESSOR,
  )
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }))
  async importResponses(
    @Param('id') assessmentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('format') format: string | undefined,
    @Body('mapping') mappingJson: string | undefined,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded (expected multipart field 'file')");
    }
    if (format !== 'csv' && format !== 'xlsx') {
      throw new BadRequestException("'format' must be 'csv' or 'xlsx'");
    }
    if (!mappingJson) {
      throw new BadRequestException("'mapping' (a JSON column mapping) is required");
    }

    let mapping: ColumnMapping;
    try {
      mapping = JSON.parse(mappingJson);
    } catch {
      throw new BadRequestException("'mapping' must be valid JSON");
    }

    return this.importService.importAssessmentResponses(
      user.tenantId,
      user.sub,
      assessmentId,
      file,
      format as SpreadsheetFormat,
      mapping,
    );
  }
}
