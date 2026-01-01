import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { CompanyService } from './company.service';
import { parseSingleFileMultipart } from '../lib/multipart/parse-single-file-multipart';
import {
  CompanyDirectoryQueryDto,
  CompanyResolveDto,
  CompanyMemberApprovalDto,
  CompanyMemberRejectDto,
  CompanyMemberUpdateDto,
  CompanyMemberInviteDto,
  CompanyMemberJoinDto,
  CompanyRecommendationsQueryDto,
  CompanyRegistrationStatsQueryDto,
  CompanySettingsDto,
  CompanyUserSearchDto,
  CompanyUserResolveDto,
  CompanySearchDto,
  GeoDivisionSearchDto,
  CompanyAttachmentSearchDto,
  CompanyLogoAttachmentDto,
  CompanyDeregistrationApplyDto,
  CreateCompanyApplicationDto,
  CompanyApplicationConsentDecisionDto,
  UpdateCompanyProfileDto,
  ResubmitCompanyApplicationDto,
  WithdrawCompanyApplicationDto,
} from './dto/company.dto';

@ApiTags('公司系统')
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  private requireUserId(req: Request) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new BadRequestException('User session has expired');
    }
    return userId;
  }

  @Get('meta')
  @ApiOperation({ summary: '获取行业、公司类型等元数据' })
  async meta() {
    return this.companyService.getMeta();
  }

  @Get('public/recommendations')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取推荐公司（最近注册、活跃）' })
  async recommendations(@Query() query: CompanyRecommendationsQueryDto) {
    return this.companyService.listRecommendations(query);
  }

  @Get('dashboard')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前玩家可管理的公司列表' })
  async dashboard(@Req() req: Request) {
    const userId = this.requireUserId(req);
    return this.companyService.listMine(userId);
  }

  @Get('statistics/registrations')
  @ApiOperation({ summary: '获取每日主体注册曲线' })
  async registrationStats(@Query() query: CompanyRegistrationStatsQueryDto) {
    return this.companyService.getDailyRegistrations(query.days);
  }

  @Get('list')
  @ApiOperation({ summary: '工商数据库列表' })
  async list(@Query() query: CompanyDirectoryQueryDto) {
    return this.companyService.listDirectory(query);
  }

  @Post('resolve')
  @ApiOperation({ summary: '按 ID 查询公司信息' })
  async resolve(@Body() body: CompanyResolveDto) {
    return this.companyService.resolveCompanies(body.ids);
  }

  @Get('search')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '搜索公司（用于股东/登记机关等选择）' })
  async searchCompanies(@Query() query: CompanySearchDto) {
    return this.companyService.searchCompanies(query);
  }

  @Get('geo/divisions/search')
  @ApiOperation({ summary: '搜索行政区划（三级）' })
  async searchGeoDivisions(@Query() query: GeoDivisionSearchDto) {
    return this.companyService.searchGeoDivisions(query);
  }

  @Get('geo/divisions/:id/path')
  @ApiOperation({ summary: '获取行政区划节点的上级路径' })
  async getGeoDivisionPath(@Param('id') id: string) {
    return this.companyService.getGeoDivisionPath(id);
  }

  @Get('users/search')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '搜索站内用户（法人/职员）' })
  async searchUsers(@Query() query: CompanyUserSearchDto) {
    return this.companyService.searchUsers(query);
  }

  @Post('users/resolve')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量解析用户ID为显示信息（用于表单回填展示）' })
  async resolveUsers(@Body() body: CompanyUserResolveDto) {
    return this.companyService.resolveUsers(body.ids);
  }

  @Get('attachments')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '搜索当前玩家上传的附件' })
  async searchAttachments(
    @Query() query: CompanyAttachmentSearchDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.searchUserAttachments(userId, query);
  }

  @Post('apply')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交公司/个体工商户注册申请' })
  async apply(@Req() req: Request, @Body() body: CreateCompanyApplicationDto) {
    const userId = this.requireUserId(req);
    return this.companyService.createApplication(userId, body);
  }

  @Get('applications/mine')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的公司注册申请列表（含同意汇总）' })
  async myApplications(@Req() req: Request) {
    const userId = this.requireUserId(req);
    return this.companyService.listMyApplications(userId);
  }

  @Get('applications/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查看我的公司注册申请详情（用于补件/修改）' })
  async myApplicationDetail(@Param('id') id: string, @Req() req: Request) {
    const userId = this.requireUserId(req);
    return this.companyService.getMyApplicationDetail(id, userId);
  }

  @Patch('applications/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新我的公司注册申请内容（仅需补件状态可用）' })
  async updateMyApplication(
    @Param('id') id: string,
    @Body() body: CreateCompanyApplicationDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.updateMyApplication(id, userId, body);
  }

  @Post('applications/:id/resubmit')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '重新提交我的公司注册申请（仅需补件状态可用，重新触发参与人同意）',
  })
  async resubmitMyApplication(
    @Param('id') id: string,
    @Body() body: ResubmitCompanyApplicationDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.resubmitMyApplication(id, userId, body);
  }

  @Post('applications/:id/withdraw')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '撤回我的公司申请（注册/注销通用）' })
  async withdrawMyApplication(
    @Param('id') id: string,
    @Body() body: WithdrawCompanyApplicationDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.withdrawMyApplication(id, userId, body);
  }

  @Get('consents/pending')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的待同意清单（按申请聚合）' })
  async myPendingConsents(@Req() req: Request) {
    const userId = this.requireUserId(req);
    return this.companyService.listMyPendingConsents(userId);
  }

  @Get('applications/:id/consents')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '查看公司注册申请的参与人同意情况（本人/申请人可见）',
  })
  async getApplicationConsents(@Param('id') id: string, @Req() req: Request) {
    const userId = this.requireUserId(req);
    return this.companyService.getApplicationConsents(id, userId);
  }

  @Post('applications/:id/consents/approve')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '同意公司注册申请（一次性同意本人需同意的所有项）' })
  async approveApplicationConsents(
    @Param('id') id: string,
    @Body() body: CompanyApplicationConsentDecisionDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.decideApplicationConsents(
      id,
      userId,
      true,
      body,
    );
  }

  @Post('applications/:id/consents/reject')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '拒绝公司注册申请（一次性拒绝本人需同意的所有项）' })
  async rejectApplicationConsents(
    @Param('id') id: string,
    @Body() body: CompanyApplicationConsentDecisionDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.decideApplicationConsents(
      id,
      userId,
      false,
      body,
    );
  }

  @Post(':id/deregistration')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交公司注销申请' })
  async applyDeregistration(
    @Param('id') id: string,
    @Body() body: CompanyDeregistrationApplyDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.createDeregistrationApplication(
      id,
      userId,
      body,
    );
  }

  @Post(':id/members/join')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '申请加入公司/个体户' })
  async joinCompany(
    @Param('id') id: string,
    @Body() body: CompanyMemberJoinDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.joinCompany(id, userId, body);
  }

  @Post(':id/members/approve')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '审批入职申请' })
  async approveJoin(
    @Param('id') id: string,
    @Body() body: CompanyMemberApprovalDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.approveJoinRequest(id, userId, body);
  }

  @Post(':id/members/reject')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '驳回入职申请' })
  async rejectJoin(
    @Param('id') id: string,
    @Body() body: CompanyMemberRejectDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.rejectJoinRequest(id, userId, body);
  }

  @Patch(':id/members/:memberId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新成员岗位/权限' })
  async updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: CompanyMemberUpdateDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.updateMember(id, userId, {
      ...body,
      memberId,
    });
  }

  @Post(':id/members/invite')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '法人邀请用户入职' })
  async inviteMember(
    @Param('id') id: string,
    @Body() body: CompanyMemberInviteDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.inviteMember(id, userId, body);
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '查看公司详情' })
  async detail(@Param('id') id: string, @Req() req: Request) {
    return this.companyService.getCompanyDetail(id, req.user?.id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '公司持有者/法人更新公司信息' })
  async updateProfile(
    @Param('id') id: string,
    @Body() body: UpdateCompanyProfileDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.updateCompanyAsMember(id, userId, body);
  }

  @Patch(':id/settings')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新公司入职/岗位设置' })
  async updateSettings(
    @Param('id') id: string,
    @Body() body: CompanySettingsDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.updateCompanySettings(id, userId, body);
  }

  @Patch(':id/logo')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '上传公司 Logo' })
  async uploadLogo(@Param('id') id: string, @Req() req: Request) {
    const userId = this.requireUserId(req);
    const { file } = await parseSingleFileMultipart(req, {
      fileFieldName: 'logo',
      maxFileSizeBytes: 10 * 1024 * 1024,
    });
    return this.companyService.updateCompanyLogoStream(id, userId, {
      originalName: file.filename,
      mimeType: file.mimeType,
      stream: file.stream,
    });
  }

  @Patch(':id/logo/attachment')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '使用已有附件更新公司 Logo' })
  async updateLogoAttachment(
    @Param('id') id: string,
    @Body() body: CompanyLogoAttachmentDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.updateCompanyLogoAttachment(
      id,
      userId,
      body.attachmentId,
    );
  }
}
