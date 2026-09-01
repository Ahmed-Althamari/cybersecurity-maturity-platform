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
    @Body('sheetName') sheetName: string | undefined,
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
      // Which xlsx tab to import -- undefined for CSV (no tabs) or a
      // single-sheet workbook, where the importer already falls back to
      // the first sheet.
      sheetName || undefined,
    );
  }

  /**
   * AI-assisted mapping suggestion for one sheet, given the headers/sample
   * rows the frontend already has from a prior preview call -- no file
   * re-upload needed. Same role gate as the two file-handling routes above,
   * even though this one never touches a file, since it's still part of
   * the same import workflow and shouldn't be reachable by a role that
   * can't import.
   */
  @Post('suggest-mapping')
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.PLATFORM_ADMIN,
    UserRole.ORGANISATION_ADMIN,
    UserRole.CISO,
    UserRole.GRC_MANAGER,
    UserRole.ASSESSOR,
  )
  async suggestMapping(
    @Body('headers') headers: string[] | undefined,
    @Body('sampleRows') sampleRows: Record<string, unknown>[] | undefined,
  ) {
    if (!Array.isArray(headers) || headers.length === 0) {
      throw new BadRequestException("'headers' (a non-empty array) is required");
    }
    return {
      mapping: await this.importService.suggestMapping(headers, Array.isArray(sampleRows) ? sampleRows : []),
    };
  }
}
