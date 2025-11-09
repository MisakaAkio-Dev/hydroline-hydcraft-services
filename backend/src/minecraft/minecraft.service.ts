import { Injectable, BadRequestException } from '@nestjs/common';
import { MinecraftServerEdition } from '@prisma/client';
import {
  addUuidDashes,
  isValidPlayerName,
  isValidUuid,
  motdToHtml,
  pingBedrock,
  pingJava,
  removeUuidDashes,
} from '../lib/minecraft';
import { PingMinecraftRequestDto } from './dto/ping-minecraft.dto';

@Injectable()
export class MinecraftService {
  async pingServer(input: PingMinecraftRequestDto) {
    const edition = input.edition ?? MinecraftServerEdition.JAVA;
    if (edition === MinecraftServerEdition.BEDROCK) {
      const response = await pingBedrock(input.host, {
        port: input.port ?? 19132,
        timeout: input.timeout,
      });
      return {
        edition,
        response,
      };
    }

    const response = await pingJava(input.host, {
      port: input.port ?? 25565,
      timeout: input.timeout,
      protocolVersion: input.protocolVersion,
    });
    return {
      edition: MinecraftServerEdition.JAVA,
      response,
    };
  }

  parseMotd(motd: unknown, isBedrock = false) {
    if (typeof motd !== 'string' && typeof motd !== 'object' && motd !== null) {
      throw new BadRequestException('无效的 MOTD 内容');
    }
    return motdToHtml(motd as never, isBedrock);
  }

  validatePlayerName(name: string) {
    return {
      name,
      valid: isValidPlayerName(name),
    };
  }

  validateUuid(rawValue: string) {
    const value = rawValue.trim();
    const valid = isValidUuid(value);
    return {
      value,
      valid,
      dashed: valid ? addUuidDashes(value) : null,
      undashed: valid ? removeUuidDashes(value) : null,
    };
  }
}
