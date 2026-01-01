import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountMinecraftProfile, Prisma } from '@prisma/client';
import { UsersServiceContext } from './users.context';

export async function listUserOauthAccounts(
  ctx: UsersServiceContext,
  userId: string,
) {
  await ensureUserExists(ctx, userId);
  const accounts = await ctx.prisma.account.findMany({
    where: { userId, provider: { not: 'credential' } },
    orderBy: { createdAt: 'desc' },
  });

  const providerKeys = Array.from(new Set(accounts.map((a) => a.provider)));
  const providers = providerKeys.length
    ? await ctx.prisma.oAuthProvider.findMany({
        where: { key: { in: providerKeys } },
      })
    : [];
  const providerMap = new Map(providers.map((p) => [p.key, p]));

  const hydratedAccounts = await hydrateAccountsWithMinecraftProfiles(
    ctx,
    accounts,
  );

  return hydratedAccounts.map((account) => {
    const provider = providerMap.get(account.provider) ?? null;
    return {
      id: account.id,
      provider: account.provider,
      providerId: account.providerId,
      providerAccountId: account.providerAccountId,
      type: account.type,
      profile: account.profile ?? null,
      createdAt: account.createdAt,
      providerName: provider?.name ?? null,
      providerType: provider?.type ?? null,
    };
  });
}

export async function unlinkUserOauthAccount(
  ctx: UsersServiceContext,
  userId: string,
  accountId: string,
  actorId?: string,
) {
  await ensureUserExists(ctx, userId);
  const account = await ctx.prisma.account.findUnique({
    where: { id: accountId },
  });
  if (!account) {
    throw new NotFoundException('OAuth binding does not exist');
  }
  if (account.userId !== userId) {
    throw new BadRequestException(
      'Binding record does not belong to this user',
    );
  }

  await ctx.prisma.account.delete({ where: { id: accountId } });
  await ctx.adminAuditService.record({
    actorId,
    action: 'unlink_oauth_account',
    targetType: 'user',
    targetId: userId,
    payload: {
      accountId,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
    },
  });
  return { success: true } as const;
}

export async function clearMicrosoftMinecraftProfile(
  ctx: UsersServiceContext,
  userId: string,
  accountId: string,
  actorId?: string,
) {
  await ensureUserExists(ctx, userId);
  const account = await ctx.prisma.account.findUnique({
    where: { id: accountId },
  });
  if (!account) {
    throw new NotFoundException('OAuth binding does not exist');
  }
  if (account.userId !== userId) {
    throw new BadRequestException(
      'Binding record does not belong to this user',
    );
  }
  if (account.provider !== 'microsoft') {
    throw new BadRequestException('Only Microsoft accounts are supported');
  }

  const profile =
    account.profile && typeof account.profile === 'object'
      ? { ...(account.profile as Record<string, unknown>) }
      : null;
  let shouldUpdateProfile = false;
  if (
    profile &&
    Object.prototype.hasOwnProperty.call(profile, 'minecraftAuth')
  ) {
    delete profile.minecraftAuth;
    shouldUpdateProfile = true;
  }
  if (profile && Object.prototype.hasOwnProperty.call(profile, 'minecraft')) {
    delete profile.minecraft;
    shouldUpdateProfile = true;
  }

  await ctx.prisma.$transaction(async (tx) => {
    await tx.accountMinecraftProfile.deleteMany({
      where: { accountId: account.id },
    });
    if (profile && shouldUpdateProfile) {
      await tx.account.update({
        where: { id: account.id },
        data: { profile: profile as Prisma.InputJsonValue },
      });
    }
  });

  await ctx.adminAuditService.record({
    actorId,
    action: 'clear_minecraft_profile',
    targetType: 'user',
    targetId: userId,
    payload: {
      accountId,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
    },
  });

  return { success: true } as const;
}

async function ensureUserExists(ctx: UsersServiceContext, userId: string) {
  const user = await ctx.prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundException('User not found');
  }
}

export async function hydrateAccountsWithMinecraftProfiles<
  T extends { id: string; profile: unknown },
>(ctx: UsersServiceContext, accounts: T[]) {
  const accountIds = accounts.map((account) => account.id);
  if (accountIds.length === 0) {
    return accounts;
  }
  const minecraftProfiles = await ctx.prisma.accountMinecraftProfile.findMany({
    where: { accountId: { in: accountIds } },
  });
  if (!minecraftProfiles.length) {
    return accounts;
  }
  const minecraftMap = new Map(
    minecraftProfiles.map((entry) => [entry.accountId, entry]),
  );
  return accounts.map((account) => {
    const minecraft = minecraftMap.get(account.id);
    if (!minecraft) {
      return account;
    }
    return {
      ...account,
      profile: mergeMinecraftProfile(account.profile, minecraft),
    } as T;
  });
}

function mergeMinecraftProfile(
  profile: unknown,
  minecraft: AccountMinecraftProfile,
): Record<string, unknown> {
  const base =
    profile && typeof profile === 'object'
      ? { ...(profile as Record<string, unknown>) }
      : {};
  base.minecraft = {
    updatedAt: minecraft.updatedAt.toISOString(),
    java:
      minecraft.javaName || minecraft.javaUuid
        ? { name: minecraft.javaName ?? null, uuid: minecraft.javaUuid ?? null }
        : null,
    bedrock:
      minecraft.bedrockGamertag || minecraft.bedrockXuid
        ? {
            gamertag: minecraft.bedrockGamertag ?? null,
            xuid: minecraft.bedrockXuid ?? null,
          }
        : null,
  };
  return base;
}
