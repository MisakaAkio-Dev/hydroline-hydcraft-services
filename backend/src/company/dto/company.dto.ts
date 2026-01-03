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

  @ValidateIf((o: LlcShareholderDto) => o.kind === 'USER')
  @IsString()
  @MinLength(1)
  userId?: string;

  @ValidateIf((o: LlcShareholderDto) => o.kind === 'COMPANY')
  @IsUUID()
  companyId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  ratio!: number;

  /**
   * 表决权比例（%）。
   * - 当 LimitedLiabilityCompanyApplicationDto.votingRightsMode === 'CUSTOM' 时必填
   * - 当 votingRightsMode === 'BY_CAPITAL_RATIO' 或未填写时，可省略（默认使用 ratio）
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  votingRatio?: number;
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

  @ValidateIf((o: LlcOperatingTermDto) => o.type === 'YEARS')
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

  /**
   * 登记机关（机关法人主体）。
   * - 推荐：前端提交该字段（更精确，审批流也以该字段为主）
   * - 兼容：若未提供，则回退使用 registrationAuthorityName（字符串）
   */
  @ValidateIf(
    (o: LimitedLiabilityCompanyApplicationDto) => !o.registrationAuthorityName,
  )
  @IsUUID()
  registrationAuthorityCompanyId?: string;

  /**
   * 登记机关名称（市场监督管理局体系）。
   * - 兼容字段：用于历史数据/旧前端
   * - 新前端可不填写，由后端根据 registrationAuthorityCompanyId 自动回填
   */
  @ValidateIf(
    (o: LimitedLiabilityCompanyApplicationDto) =>
      !o.registrationAuthorityCompanyId,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  registrationAuthorityName?: string;

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

  /**
   * 股东表决权行使方式：
   * - BY_CAPITAL_RATIO：按出资比例行使（默认）
   * - CUSTOM：自定义各股东表决权比例（合计 100%）
   */
  @IsOptional()
  @IsIn(['BY_CAPITAL_RATIO', 'CUSTOM'])
  votingRightsMode?: 'BY_CAPITAL_RATIO' | 'CUSTOM';

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

  @ValidateIf((o: CreateCompanyApplicationDto) => !o.typeCode)
  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsString()
  industryCode?: string;

  @ValidateIf((o: CreateCompanyApplicationDto) => !o.industryCode)
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
  @IsString()
  legalRepresentativeId?: string;

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

  @ValidateIf((o: AdminCreateCompanyDto) => !o.typeCode)
  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsString()
  industryCode?: string;

  @ValidateIf((o: AdminCreateCompanyDto) => !o.industryCode)
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

  /**
   * 机关法人专用：所属行政区划节点 id（支持 1/2/3 级）。
   * - 后端会再做存在性与级别校验
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  domicileDivisionId?: string;
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

export class CompanyRenameApplyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  newName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class CompanyDomicileChangeApplyDto {
  /**
   * 新住所地址（详细地址）
   */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  domicileAddress!: string;

  /**
   * 可选：变更所属行政区划（若不填写则保持不变）
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  domicileDivisionId?: string;

  /**
   * 可选：前端传回的区划路径缓存（若不填写则保持不变）
   */
  @IsOptional()
  @IsObject()
  domicileDivisionPath?: {
    level1?: { id: string; name: string } | null;
    level2?: { id: string; name: string } | null;
    level3?: { id: string; name: string } | null;
  };

  /**
   * 新登记机关名称（市场监督管理局体系）。
   * - 若填写了 domicileDivisionId，建议同时填写该字段
   * - 后端会校验必须来自“所选区划对应的市场监管局/上级机关/总局”的候选集合
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  registrationAuthorityName?: string;

  /**
   * 新登记机关（机关法人主体）。
   * - 推荐：前端提交该字段；后端会校验其名称属于该行政区划的可选集合
   * - 兼容：未提供时回退使用 registrationAuthorityName
   */
  @IsOptional()
  @IsUUID()
  registrationAuthorityCompanyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class CompanyBusinessScopeChangeApplyDto {
  /**
   * 新经营范围
   */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  businessScope!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class CompanyOfficerChangeApplyDto {
  /**
   * 变更后的董事列表（仅 DIRECTOR；不含董事长/副董事长等扩展角色）
   * - 不填写则表示不变更董事
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  directorIds?: string[];

  /**
   * 变更后的监事列表（仅 SUPERVISOR）
   * - 不填写则表示不变更监事
   * - 可填写空数组表示清空监事
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supervisorIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class CompanyManagementChangeApplyDto {
  /**
   * 新经理 userId
   * - 不填写表示不变更经理
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  managerId?: string;

  /**
   * 新副经理 userId
   * - 不填写表示不变更副经理
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  deputyManagerId?: string;

  /**
   * 新财务负责人 userId
   * - 不填写表示不变更财务负责人
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  financialOfficerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class CompanyCapitalChangeApplyDto {
  /**
   * 变更类型：
   * - INCREASE：增资
   * - DECREASE：减资
   *
   * 可选：不填时后端会根据新旧注册资本大小推断（相等则报错）。
   */
  @IsOptional()
  @IsIn(['INCREASE', 'DECREASE'])
  changeType?: 'INCREASE' | 'DECREASE';

  /**
   * 新注册资本金额
   */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  newRegisteredCapital!: number;

  /**
   * 变更后股东结构（出资比例合计 100%）
   * - 支持原股东调整
   * - 支持新增股东（USER / COMPANY）
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LlcShareholderDto)
  shareholders!: LlcShareholderDto[];

  /**
   * 股东表决权行使方式：
   * - BY_CAPITAL_RATIO：按出资比例行使（默认）
   * - CUSTOM：自定义各股东表决权比例（合计 100%）
   */
  @IsOptional()
  @IsIn(['BY_CAPITAL_RATIO', 'CUSTOM'])
  votingRightsMode?: 'BY_CAPITAL_RATIO' | 'CUSTOM';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class EquityTransferPartyDto {
  @IsIn(['USER', 'COMPANY'])
  kind!: 'USER' | 'COMPANY';

  @ValidateIf((o: EquityTransferPartyDto) => o.kind === 'USER')
  @IsString()
  @MinLength(1)
  userId?: string;

  @ValidateIf((o: EquityTransferPartyDto) => o.kind === 'COMPANY')
  @IsUUID()
  companyId?: string;
}

export class CompanyEquityTransferApplyDto {
  @ValidateNested()
  @Type(() => EquityTransferPartyDto)
  transferor!: EquityTransferPartyDto;

  @ValidateNested()
  @Type(() => EquityTransferPartyDto)
  transferee!: EquityTransferPartyDto;

  /**
   * 转让股权比例（%）
   */
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  @Max(100)
  ratio!: number;

  /**
   * 转让表决权比例（%）
   */
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  @Max(100)
  votingRatio!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
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
