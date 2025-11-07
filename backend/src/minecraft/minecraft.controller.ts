import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MinecraftService } from './minecraft.service';
import { PingMinecraftRequestDto } from './dto/ping-minecraft.dto';
import { ParseMotdDto } from './dto/parse-motd.dto';
// extra imports removed
import { ValidatePlayerNameDto } from './dto/validate-player-name.dto';
import { ValidateUuidDto } from './dto/validate-uuid.dto';

@ApiTags('Minecraft 工具')
@Controller('minecraft')
export class MinecraftController {
  constructor(private readonly minecraftService: MinecraftService) {}

  @Post('ping')
  @ApiOperation({ summary: 'Ping Minecraft 服务器状态' })
  async ping(@Body() dto: PingMinecraftRequestDto) {
    return this.minecraftService.pingServer(dto);
  }

  @Post('ping/adhoc')
  @ApiOperation({ summary: '临时 Ping 指定服务器 （不保存记录）' })
  adhoc(@Body() dto: PingMinecraftRequestDto) {
    return this.minecraftService.pingServer(dto);
  }

  @Post('motd/parse')
  @ApiOperation({ summary: '解析 Minecraft MOTD 并输出 HTML' })
  parseMotd(@Body() dto: ParseMotdDto) {
    return {
      html: this.minecraftService.parseMotd(dto.motd, Boolean(dto.bedrock)),
    };
  }

  @Get('player-name/validate')
  @ApiOperation({ summary: '校验玩家昵称格式是否合法' })
  validatePlayerName(@Query() dto: ValidatePlayerNameDto) {
    return this.minecraftService.validatePlayerName(dto.name);
  }

  @Get('uuid/validate')
  @ApiOperation({ summary: '校验并格式化玩家 UUID' })
  validateUuid(@Query() dto: ValidateUuidDto) {
    return this.minecraftService.validateUuid(dto.value);
  }
}
