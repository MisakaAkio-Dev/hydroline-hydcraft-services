import { PIICStatus } from '@prisma/client';
import { UsersServiceContext } from './users.context';
import { ensureUser } from './users-core.manager';
import { generatePiic } from './users.helpers';
import { RegeneratePiicDto } from '../../dto/regenerate-piic.dto';

export async function regeneratePiic(
  ctx: UsersServiceContext,
  userId: string,
  _dto: RegeneratePiicDto,
  _actorId?: string,
) {
  await ensureUser(ctx, userId);
  const newPiic = await generatePiic(ctx, ctx.prisma, userId);
  const now = new Date();

  const result = await ctx.prisma.$transaction(async (tx) => {
    const profile = await tx.userProfile.upsert({
      where: { userId },
      update: {
        piic: newPiic,
        piicAssignedAt: now,
      },
      create: {
        userId,
        piic: newPiic,
        piicAssignedAt: now,
      },
    });

    await tx.userPiicHistory.updateMany({
      where: { userId, status: PIICStatus.ACTIVE },
      data: {
        status: PIICStatus.REVOKED,
        revokedAt: now,
        revokedById: null,
      },
    });

    await tx.userPiicHistory.create({
      data: {
        userId,
        piic: newPiic,
        status: PIICStatus.ACTIVE,
      },
    });

    return profile;
  });

  return result;
}
