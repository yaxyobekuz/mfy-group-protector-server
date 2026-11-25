import { Module } from "@nestjs/common";

import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { ReportsExportService } from "./reports-export.service";
import { ReportsCoverageService } from "./reports-coverage.service";

@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportsExportService,
    ReportsCoverageService,
  ],
})
export class ReportsModule {}
