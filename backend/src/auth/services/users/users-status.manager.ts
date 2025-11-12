import { LifecycleEventType, StatusSource } from '@prisma/client';
import { UsersServiceContext } from './users.context';
import { ensureUser } from './users-core.manager';
import { CreateStatusEventDto } from '../../dto/create-status-event.dto';
import { CreateLifecycleEventDto } from '../../dto/create-lifecycle-event.dto';
import { toJsonValue } from './users.helpers';

export async function addStatusEvent(
  ctx: UsersServiceContext,
  userId: string,
  dto: CreateStatusEventDto,
  actorId?: string,
) {
  await ensureUser(ctx, userId);
  const occurredAt = new Date();
  const source = dto.source ?? StatusSource.ADMIN;
  const event = await ctx.prisma.userStatusEvent.create({
    data: {
      userId,
      status: dto.status,
      reasonCode: dto.reasonCode,
      reasonDetail: dto.reasonDetail,
      source,
      metadata: toJsonValue(dto.metadata),
      createdById: actorId,
    },
  });

  await ctx.prisma.userStatusSnapshot.upsert({
    where: { userId },
    create: { userId, statusEventId: event.id, status: event.status },
    update: { statusEventId: event.id, status: event.status },
  });

  await ctx.prisma.userLifecycleEvent.create({
    data: {
      userId,
      eventType: LifecycleEventType.STATUS_CHANGE,
      occurredAt,
      source,
      notes: dto.reasonDetail,
      metadata: toJsonValue({
        status: event.status,
        reasonCode: event.reasonCode,
      }),
      createdById: actorId,
    },
  });

  return event;
}

export async function addLifecycleEvent(
  ctx: UsersServiceContext,
  userId: string,
  dto: CreateLifecycleEventDto,
  createdById?: string,
) {
  await ensureUser(ctx, userId);
  return ctx.prisma.userLifecycleEvent.create({
    data: {
      userId,
      eventType: dto.eventType,
      occurredAt: new Date(dto.occurredAt),
      source: dto.source,
      notes: dto.notes,
      metadata: toJsonValue(dto.metadata),
      createdById,
    },
  });
}
