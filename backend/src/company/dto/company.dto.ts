import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CompanyCategory,
  CompanyMemberRole,
  CompanyStatus,
  CompanyVisibility,
} from '@prisma/client';

export class CompanySearchDto {
  @IsString()
  @MinLength(1)
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class GeoDivisionSearchDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  level?: 1 | 2 | 3;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class LlcShareholderDto {
  @IsIn(['USER', 'COMPANY'])
  kind!: 'USER' | 'COMPANY';

  @ValidateIf((o) => o.kind === 'USER')
  @IsString()
  @MinLength(1)
  userId?: string;

  @ValidateIf((o) => o.kind === 'COMPANY')
  @IsUUID()
  companyId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  ratio!: number;
}

export class LlcDirectorsDto {
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  directorIds!: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  chairpersonId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  viceChairpersonId?: string;
}

export class LlcManagersDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  managerId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  deputyManagerId?: string;
}

export class LlcSupervisorsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  supervisorIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  chairpersonId?: string;
}

export class LlcOperatingTermDto {
  @IsIn(['LONG_TERM', 'YEARS'])
  type!: 'LONG_TERM' | 'YEARS';

  @ValidateIf((o) => o.type === 'YEARS')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  years?: number;
}

export class LimitedLiabilityCompanyApplicationDto {
  @IsString()
  domicileDivisionId!: string;

  @IsOptional()
  @IsObject()
  domicileDivisionPath?: {
    level1?: { id: string; name: string } | null;
    level2?: { id: string; name: string } | null;
    level3?: { id: string; name: string } | null;
  };

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  registeredCapital!: number;

  @IsIn([1, 2, 3])
  @Type(() => Number)
  @IsInt()
  administrativeDivisionLevel!: 1 | 2 | 3;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  brandName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  industryFeature!: string;

  @IsString()
  @MaxLength(80)
  registrationAuthorityName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  domicileAddress!: string;

  @ValidateNested()
  @Type(() => LlcOperatingTermDto)
  operatingTerm!: LlcOperatingTermDto;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  businessScope!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LlcShareholderDto)
  shareholders!: LlcShareholderDto[];

  @ValidateNested()
  @Type(() => LlcDirectorsDto)
  directors!: LlcDirectorsDto;

  @ValidateNested()
  @Type(() => LlcManagersDto)
  managers!: LlcManagersDto;

  @IsString()
  @MinLength(1)
  legalRepresentativeId!: string;

  @ValidateNested()
  @Type(() => LlcSupervisorsDto)
  @IsOptional()
  supervisors?: LlcSupervisorsDto;

  @IsOptional()
  @IsString()
  @MinLength(1)
  financialOfficerId?: string;
}

export class CompanyRecommendationsQueryDto {
  @IsOptional()
  @IsString()
  kind?: 'recent' | 'active';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CompanyRegistrationStatsQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(7)
  @Max(90)
  days?: number;
}

export class CreateCompanyApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  typeCode?: string;

  @ValidateIf((o) => !o.typeCode)
  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsString()
  industryCode?: string;

  @ValidateIf((o) => !o.industryCode)
  @IsOptional()
  @IsUUID()
  industryId?: string;

  @IsOptional()
  @IsEnum(CompanyCategory)
  category?: CompanyCategory;

  @IsOptional()
  @IsString()
  legalRepresentativeId?: string;

  /**
   * 有限责任公司专用字段（typeCode === limited_liability_company 或对应 typeId 时生效）
   * 其内容会被整体保存到 CompanyApplication.payload 以供审核与后续落库扩展使用。
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => LimitedLiabilityCompanyApplicationDto)
  llc?: LimitedLiabilityCompanyApplicationDto;
}

export class CompanyApplicationConsentDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class UpdateCompanyProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  contactAddress?: string;

  @IsOptional()
  @IsString()
  homepageUrl?: string;

  @IsOptional()
  @IsString()
  industryId?: string;

  @IsOptional()
  @IsString()
  industryCode?: string;

  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}

export class AdminUpdateCompanyDto extends UpdateCompanyProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @IsEnum(CompanyVisibility)
  visibility?: CompanyVisibility;

  @IsOptional()
  @IsBoolean()
  highlighted?: boolean;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  recommendationScore?: number;

  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsString()
  typeCode?: string;

  @IsOptional()
  @IsEnum(CompanyCategory)
  category?: CompanyCategory;

  @IsOptional()
  @IsUUID()
  logoAttachmentId?: string;

  @IsOptional()
  @IsString()
  auditReason?: string;
}

export class AdminCreateCompanyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  typeCode?: string;

  @ValidateIf((o) => !o.typeCode)
  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsString()
  industryCode?: string;

  @ValidateIf((o) => !o.industryCode)
  @IsOptional()
  @IsUUID()
  industryId?: string;

  @IsOptional()
  @IsEnum(CompanyCategory)
  category?: CompanyCategory;

  @IsOptional()
  @IsString()
  legalRepresentativeId?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @IsEnum(CompanyVisibility)
  visibility?: CompanyVisibility;
}

export class AdminCompanyListQueryDto {
  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsUUID()
  industryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(5)
  @Max(50)
  pageSize?: number;
}

export class CompanyUserSearchDto {
  @IsString()
  @MinLength(1)
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CompanyUserResolveDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class CompanyMemberInviteDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsEnum(CompanyMemberRole)
  role?: CompanyMemberRole;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  positionCode?: string;
}

export class CompanyMemberJoinDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  positionCode?: string;
}

export class CompanyAttachmentSearchDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CompanyLogoAttachmentDto {
  @IsString()
  attachmentId!: string;
}

export class CompanyDeregistrationApplyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class CompanyDirectoryQueryDto {
  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsUUID()
  industryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(5)
  @Max(50)
  pageSize?: number;
}

export class CompanyResolveDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class CompanySettingsDto {
  @IsIn(['AUTO', 'REVIEW'])
  joinPolicy!: 'AUTO' | 'REVIEW';

  @IsOptional()
  @IsObject()
  positionPermissions?: Record<string, string[]>;
}

export class CompanyMemberApprovalDto {
  @IsUUID()
  memberId!: string;

  @IsOptional()
  @IsString()
  positionCode?: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class CompanyMemberRejectDto {
  @IsUUID()
  memberId!: string;
}

export class CompanyMemberUpdateDto {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsString()
  positionCode?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(['VIEW_DASHBOARD', 'MANAGE_MEMBERS', 'EDIT_COMPANY'], { each: true })
  permissions?: string[];
}

export class CompanyActionDto {
  @IsString()
  actionKey!: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class ResubmitCompanyApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class WithdrawCompanyApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
