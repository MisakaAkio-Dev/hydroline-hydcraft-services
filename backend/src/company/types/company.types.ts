import { Prisma } from '@prisma/client';

export const companyInclude = Prisma.validator<Prisma.CompanyInclude>()({
  type: true,
  industry: true,
  legalRepresentative: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarAttachmentId: true,
      profile: {
        select: {
          displayName: true,
        },
      },
    },
  },
  policies: {
    orderBy: { createdAt: 'desc' },
  },
  auditRecords: {
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
          profile: {
            select: {
              displayName: true,
            },
          },
        },
      },
    },
  },
  applications: {
    orderBy: { submittedAt: 'desc' },
    take: 5,
  },
  llcRegistration: {
    include: {
      shareholders: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarAttachmentId: true,
              profile: { select: { displayName: true } },
            },
          },
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              legalRepresentativeId: true,
              unifiedSocialCreditCode: true,
              registrationNumber: true,
            },
          },
        },
      },
      officers: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarAttachmentId: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      },
    },
  },
  workflowInstance: {
    include: { definition: true },
  },
});

export type CompanyWithRelations = Prisma.CompanyGetPayload<{
  include: typeof companyInclude;
}>;
