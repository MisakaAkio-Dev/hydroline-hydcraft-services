import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { CompanyApplicationSettingsDto } from '../dto/admin-config.dto';
import {
  DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
  DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE,
  DEFAULT_COMPANY_RENAME_WORKFLOW_CODE,
} from '../company.constants';

const COMPANY_CONFIG_NAMESPACE = 'company';
const COMPANY_CONFIG_AUTO_APPROVE_KEY = 'auto_approve_applications';

@Injectable()
export class CompanyConfigService {
  constructor(private readonly configService: ConfigService) {}

  async getCompanyApplicationSettings(
    workflowCode?: string,
  ): Promise<CompanyApplicationSettingsDto> {
    const entry = await this.configService.getEntry(
      COMPANY_CONFIG_NAMESPACE,
      this.resolveAutoApproveKey(workflowCode),
    );
    const value = entry?.value;
    const autoApprove =
      typeof value === 'boolean'
        ? value
        : typeof value === 'object' && value !== null && 'autoApprove' in value
          ? Boolean((value as { autoApprove?: boolean }).autoApprove)
          : false;
    return { autoApprove };
  }

  async updateCompanyApplicationSettings(
    autoApprove: boolean,
    userId: string,
    workflowCode?: string,
  ): Promise<CompanyApplicationSettingsDto> {
    const namespace = await this.configService.ensureNamespaceByKey(
      COMPANY_CONFIG_NAMESPACE,
      {
        name: '工商系统配置',
        description: '工商系统全局设置',
      },
    );
    const entry = await this.configService.getEntry(
      COMPANY_CONFIG_NAMESPACE,
      this.resolveAutoApproveKey(workflowCode),
    );
    if (entry) {
      await this.configService.updateEntry(
        entry.id,
        { value: autoApprove },
        userId,
      );
    } else {
      const description =
        workflowCode === DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE
          ? '公司注销自动审批'
          : workflowCode === DEFAULT_COMPANY_RENAME_WORKFLOW_CODE
            ? '公司更名自动审批'
            : workflowCode === DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE
              ? '公司住所变更自动审批'
              : workflowCode ===
                  DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE
                ? '公司经营范围变更自动审批'
                : workflowCode === DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE
                  ? '公司注册资本变更自动审批'
                  : workflowCode ===
                      DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE
                    ? '公司董事/监事变更自动审批'
                    : '公司申请自动审批';
      await this.configService.createEntry(
        namespace.id,
        {
          key: this.resolveAutoApproveKey(workflowCode),
          value: autoApprove,
          description,
        },
        userId,
      );
    }
    return { autoApprove };
  }

  resolveAutoApproveKey(workflowCode?: string) {
    const normalizedCode = workflowCode?.trim();
    if (normalizedCode === DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE) {
      return 'auto_approve_deregistration';
    }
    if (normalizedCode === DEFAULT_COMPANY_RENAME_WORKFLOW_CODE) {
      return 'auto_approve_name_change';
    }
    if (normalizedCode === DEFAULT_COMPANY_DOMICILE_CHANGE_WORKFLOW_CODE) {
      return 'auto_approve_domicile_change';
    }
    if (
      normalizedCode === DEFAULT_COMPANY_BUSINESS_SCOPE_CHANGE_WORKFLOW_CODE
    ) {
      return 'auto_approve_business_scope_change';
    }
    if (normalizedCode === DEFAULT_COMPANY_CAPITAL_CHANGE_WORKFLOW_CODE) {
      return 'auto_approve_capital_change';
    }
    if (normalizedCode === DEFAULT_COMPANY_OFFICER_CHANGE_WORKFLOW_CODE) {
      return 'auto_approve_officer_change';
    }
    if (normalizedCode === DEFAULT_COMPANY_MANAGEMENT_CHANGE_WORKFLOW_CODE) {
      return 'auto_approve_management_change';
    }
    return COMPANY_CONFIG_AUTO_APPROVE_KEY;
  }
}
