import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ConfigModule } from '../config/config.module';
import { CompanyService } from './company.service';
import { CompanyMetaService } from './services/company-meta.service';
import { CompanySupportService } from './services/company-support.service';
import { CompanyApplicationService } from './services/company-application.service';
import { CompanyGeoService } from './services/company-geo.service';
import { CompanyConfigService } from './services/company-config.service';
import { CompanyRegistrationPersistenceService } from './services/company-registration-persistence.service';
import { CompanyChangePersistenceService } from './services/company-change-persistence.service';
import { CompanyWorkflowService } from './services/company-workflow.service';
import { CompanySerializerService } from './services/company-serializer.service';
import { CompanyPermissionService } from './services/company-permission.service';
import { CompanyConsentService } from './services/company-consent.service';
import { CompanyController } from './company.controller';
import { CompanyAdminService } from './services/company-admin.service';
import { CompanyAdminController } from './company-admin.controller';
import { CompanyConfigAdminController } from './company-config-admin.controller';
import { CompanyApplicationAdminController } from './company-application-admin.controller';
import { CompanyRegistryApplicationController } from './company-application-registry.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AttachmentsModule,
    WorkflowModule,
    ConfigModule,
  ],
  providers: [
    CompanyService,
    CompanyMetaService,
    CompanySupportService,
    CompanyApplicationService,
    CompanyGeoService,
    CompanyConfigService,
    CompanyWorkflowService,
    CompanySerializerService,
    CompanyPermissionService,
    CompanyConsentService,
    CompanyAdminService,
    CompanyRegistrationPersistenceService,
    CompanyChangePersistenceService,
  ],
  controllers: [
    CompanyController,
    CompanyAdminController,
    CompanyConfigAdminController,
    CompanyApplicationAdminController,
    CompanyRegistryApplicationController,
  ],
  exports: [CompanyService],
})
export class CompanyModule {}
