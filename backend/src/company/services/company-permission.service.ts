import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CompanyLlcOfficerRole,
  CompanyLlcShareholderKind,
  CompanyStatus,
  CompanyVisibility,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CompanyEquityTransferApplyDto } from '../dto/company.dto';
import type { CompanyWithRelations } from '../types/company.types';

@Injectable()
export class CompanyPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  assertCompanyEditor(company: CompanyWithRelations, userId: string) {
    const isLegalRepresentative = company.legalRepresentativeId === userId;
    const editorOfficerRoles = new Set<CompanyLlcOfficerRole>([
      CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE,
      CompanyLlcOfficerRole.MANAGER,
      CompanyLlcOfficerRole.DEPUTY_MANAGER,
    ]);
    const isEditorOfficer = (company.llcRegistration?.officers ?? []).some(
      (o) => o.userId === userId && editorOfficerRoles.has(o.role),
    );
    if (!isLegalRepresentative && !isEditorOfficer) {
      throw new ForbiddenException(
        'Only legal representative or authorized officers can edit company profile',
      );
    }
  }

  canViewCompany(company: CompanyWithRelations, viewerId?: string | null) {
    if (viewerId) {
      if (company.legalRepresentativeId === viewerId) return true;
      const llc = company.llcRegistration;
      if (
        (llc?.officers ?? []).some((o) => o.userId === viewerId) ||
        (llc?.shareholders ?? []).some(
          (s) =>
            s.kind === CompanyLlcShareholderKind.USER && s.userId === viewerId,
        )
      ) {
        return true;
      }
    }
    if (company.visibility === CompanyVisibility.PUBLIC) {
      return company.status !== CompanyStatus.REJECTED;
    }
    return false;
  }

  async assertCanInitiateDeregistration(
    company: CompanyWithRelations,
    userId: string,
  ) {
    if (company.legalRepresentativeId === userId) return;
    if (
      (company.llcRegistration?.officers ?? []).some(
        (o) =>
          o.userId === userId &&
          o.role === CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE,
      )
    ) {
      return;
    }

    const shareholders = company.llcRegistration?.shareholders ?? [];
    if (!shareholders.length) {
      throw new ForbiddenException(
        'Only legal representative or shareholders can request deregistration',
      );
    }

    for (const s of shareholders) {
      if (s.kind === CompanyLlcShareholderKind.USER && s.userId === userId) {
        return;
      }
    }

    const shareholderCompanyIds = shareholders
      .filter(
        (s) =>
          s.kind === CompanyLlcShareholderKind.COMPANY && Boolean(s.companyId),
      )
      .map((s) => s.companyId as string);
    if (!shareholderCompanyIds.length) {
      throw new ForbiddenException(
        'Only legal representative or shareholders can request deregistration',
      );
    }

    const companies = await this.prisma.company.findMany({
      where: { id: { in: shareholderCompanyIds } },
      select: { id: true, legalRepresentativeId: true },
    });
    const byId = new Map(companies.map((c) => [c.id, c]));
    for (const cid of shareholderCompanyIds) {
      const c = byId.get(cid);
      if (!c) continue;
      if (c.legalRepresentativeId === userId) {
        return;
      }
    }

    throw new ForbiddenException(
      'Only legal representative or shareholders can request deregistration',
    );
  }

  async assertCanInitiateRename(company: CompanyWithRelations, userId: string) {
    if (company.legalRepresentativeId === userId) return;
    if (
      (company.llcRegistration?.officers ?? []).some(
        (o) =>
          o.userId === userId &&
          o.role === CompanyLlcOfficerRole.LEGAL_REPRESENTATIVE,
      )
    ) {
      return;
    }

    const shareholders = company.llcRegistration?.shareholders ?? [];
    if (!shareholders.length) {
      throw new ForbiddenException(
        'Only legal representative or shareholders can request company name change',
      );
    }

    for (const s of shareholders) {
      if (s.kind === CompanyLlcShareholderKind.USER && s.userId === userId) {
        return;
      }
    }

    const shareholderCompanyIds = shareholders
      .filter(
        (s) =>
          s.kind === CompanyLlcShareholderKind.COMPANY && Boolean(s.companyId),
      )
      .map((s) => s.companyId as string);
    if (!shareholderCompanyIds.length) {
      throw new ForbiddenException(
        'Only legal representative or shareholders can request company name change',
      );
    }

    const companies = await this.prisma.company.findMany({
      where: { id: { in: shareholderCompanyIds } },
      select: { id: true, legalRepresentativeId: true },
    });
    const byId = new Map(companies.map((c) => [c.id, c]));
    for (const cid of shareholderCompanyIds) {
      const c = byId.get(cid);
      if (!c) continue;
      if (c.legalRepresentativeId === userId) {
        return;
      }
    }

    throw new ForbiddenException(
      'Only legal representative or shareholders can request company name change',
    );
  }

  async assertCanInitiateManagementChange(
    company: CompanyWithRelations,
    userId: string,
  ) {
    const directorRoles = new Set<CompanyLlcOfficerRole>([
      CompanyLlcOfficerRole.DIRECTOR,
      CompanyLlcOfficerRole.CHAIRPERSON,
      CompanyLlcOfficerRole.VICE_CHAIRPERSON,
    ]);
    const ok = (company.llcRegistration?.officers ?? []).some(
      (o) => o.userId === userId && directorRoles.has(o.role),
    );
    if (!ok) {
      throw new ForbiddenException(
        'Only directors can request management change',
      );
    }
  }

  async assertCanInitiateEquityTransfer(
    company: CompanyWithRelations,
    userId: string,
    dto: CompanyEquityTransferApplyDto,
  ) {
    const transferor = dto.transferor;
    const transferee = dto.transferee;

    if (
      transferor.kind === transferee.kind &&
      ((transferor.kind === 'USER' &&
        transferor.userId === transferee.userId) ||
        (transferor.kind === 'COMPANY' &&
          transferor.companyId === transferee.companyId))
    ) {
      throw new BadRequestException('转让方与受让方不能为同一主体');
    }

    if (transferor.kind === 'USER') {
      if (!transferor.userId) {
        throw new BadRequestException('转让方为用户时必须填写 userId');
      }
      if (transferor.userId !== userId) {
        throw new ForbiddenException('只有拟转让股权的股东本人可以发起申请');
      }
    } else {
      if (!transferor.companyId) {
        throw new BadRequestException('转让方为公司时必须填写 companyId');
      }
      const shareholderCompany = await this.prisma.company.findUnique({
        where: { id: transferor.companyId },
        select: { id: true, legalRepresentativeId: true },
      });
      if (!shareholderCompany) {
        throw new BadRequestException('转让方公司不存在');
      }
      if (!shareholderCompany.legalRepresentativeId) {
        throw new BadRequestException('转让方公司未设置法定代表人');
      }
      if (shareholderCompany.legalRepresentativeId !== userId) {
        throw new ForbiddenException('只有股东公司的法定代表人可以发起申请');
      }
    }

    if (transferee.kind === 'USER') {
      if (!transferee.userId) {
        throw new BadRequestException('受让方为用户时必须填写 userId');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: transferee.userId },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException('受让方用户不存在');
      }
    } else {
      if (!transferee.companyId) {
        throw new BadRequestException('受让方为公司时必须填写 companyId');
      }
      const targetCompany = await this.prisma.company.findUnique({
        where: { id: transferee.companyId },
        select: { id: true, legalRepresentativeId: true },
      });
      if (!targetCompany) {
        throw new BadRequestException('受让方公司不存在');
      }
      if (!targetCompany.legalRepresentativeId) {
        throw new BadRequestException('受让方公司未设置法定代表人');
      }
    }

    const shareholders = company.llcRegistration?.shareholders ?? [];
    const from = shareholders.find((s) => {
      if (transferor.kind === 'USER') {
        return (
          s.kind === CompanyLlcShareholderKind.USER &&
          s.userId === transferor.userId
        );
      }
      return (
        s.kind === CompanyLlcShareholderKind.COMPANY &&
        s.companyId === transferor.companyId
      );
    });
    if (!from) {
      throw new BadRequestException('转让方不是该公司的现有股东');
    }
    if (Number(dto.ratio) > Number(from.ratio) + 1e-9) {
      throw new BadRequestException('转让股权比例超过转让方持有比例');
    }
    if (Number(dto.votingRatio) > Number(from.votingRatio) + 1e-9) {
      throw new BadRequestException('转让表决权比例超过转让方持有表决权比例');
    }
  }
}
