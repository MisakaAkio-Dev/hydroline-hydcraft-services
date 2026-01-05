import { BadRequestException, Injectable } from '@nestjs/common';
import { CompanyIndustry, CompanyType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../utils/slugify';

@Injectable()
export class CompanySupportService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCompanyNameAvailable(
    name: string,
    companyIdToIgnore?: string | null,
  ) {
    const normalized = this.normalizeCompanyName(name);
    if (!normalized) {
      return;
    }
    const exists = await this.prisma.company.findFirst({
      where: {
        name: { equals: normalized, mode: 'insensitive' },
        ...(companyIdToIgnore ? { id: { not: companyIdToIgnore } } : {}),
      },
      select: { id: true },
    });
    if (exists) {
      throw new BadRequestException('公司名称已被占用，请更换一个名称');
    }
  }

  async resolveCompanyType(
    typeId?: string,
    typeCode?: string,
    optional = false,
  ): Promise<CompanyType | null> {
    if (!typeId && !typeCode) {
      return null;
    }
    const type = await this.prisma.companyType.findFirst({
      where: {
        OR: [
          typeId ? { id: typeId } : undefined,
          typeCode ? { code: typeCode } : undefined,
        ].filter(Boolean) as Prisma.CompanyTypeWhereInput[],
      },
    });
    if (!type && !optional) {
      throw new BadRequestException('Company type not found');
    }
    return type;
  }

  async resolveIndustry(
    industryId?: string,
    industryCode?: string,
    optional = false,
  ): Promise<CompanyIndustry | null> {
    if (!industryId && !industryCode) {
      return null;
    }
    const industry = await this.prisma.companyIndustry.findFirst({
      where: {
        OR: [
          industryId ? { id: industryId } : undefined,
          industryCode ? { code: industryCode } : undefined,
        ].filter(Boolean) as Prisma.CompanyIndustryWhereInput[],
      },
    });
    if (!industry && !optional) {
      throw new BadRequestException('Industry category not found');
    }
    return industry;
  }

  async generateUniqueSlug(name: string) {
    const base = slugify(name);
    for (let i = 0; i < 20; i += 1) {
      const candidate = i === 0 ? base : `${base}-${i}`;
      const exists = await this.prisma.company.findUnique({
        where: { slug: candidate },
      });
      if (!exists) {
        return candidate;
      }
    }
    return `${base}-${randomUUID().slice(0, 8)}`;
  }

  private normalizeCompanyName(name: string) {
    return (name ?? '').trim();
  }
}
