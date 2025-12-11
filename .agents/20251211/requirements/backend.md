# 后端需求拆解

## 模型与实体
- `CompanyEntity`：包括基础字段（ID、名称、注册号、统一社会信用代码、类型[公司/个体工商户]、联系人、地址、主体状态等），以及当前流程状态/版本。
- `CompanyApplication`：用于玩家提交的申请记录，可拆分为基础资料、附加材料、来源玩家 ID、提交时间、当前审核节点。
- `CompanyAuditRecord`：记录每一次审批动作（审核人、意见、建议、附件、时间）供追踪。
- `WorkflowState`：通用流程状态枚举（待审核、补充资料、已通过、已驳回、已归档等），并支持自定义扩展。
- `CompanyIndustry` + `CompanyType`：可配置的行业与类型元数据，包含分类、code、说明、所需材料、默认配置。
- `CompanyPolicy` 与制度体系：用于记录章程、审批规则、内部流程、文件版本与状态。
- `CompanyMember` 角色（持有者/法人/创建者/执行人等）需直接映射到权限系统，便于前台 `/company/dashboard` 与流程节点校验。

## 接口规划
1. `POST /companies/apply`：玩家提交公司/个体工商户注册申请，自动进入初始流程节点。
2. `GET /companies/me`：玩家查询自己提交的公司信息与流程进度。
3. `GET /admin/companies`：后台分页列出所有公司申请，可根据状态/类型过滤。
4. `GET /admin/companies/:id`：单条记录详情，包含当前流程节点与审核记录。
5. `POST /admin/companies/:id/actions`：管理员执行流程动作（通过、驳回、要求补件等），自动记录审批意见并触发状态迁移。
6. `GET /workflow/definitions`：列出可用的流程模板与节点，便于后台配置。
7. `POST /workflow/definitions`（可选）：支持动态新增/调整流程。
8. `GET /admin/company/applications`：分页列出所有申请记录（携带申请人、公司、流程信息），供 `/admin/company/applications` 页面使用。
9. `GET|POST /admin/company/config/industries`：查询 / 新建或更新行业配置，支持父级、颜色、图标、描述等字段。
10. `GET|POST /admin/company/config/types`：查询 / 新建或更新公司类型，维护说明、分类、所需材料与自定义 JSON 配置。

## 核心能力
- 流程引擎核心：
  - 抽象“流程模板” + “流程实例”概念，支持配置节点定义、待办角色、超时提醒。
  - 操作后自动将流程状态映射到业务实体（如 `CompanyEntity.currentState`）。
  - 支持多条审批链、平行/串行配置。
- 权限：
  - 玩家只能访问自己申请，且只能创建/查看。
  - 管理员角色（如 `admin` 或 `company-reviewer`）可执行流程操作。
- 配置权限需细化：
  - `company.admin.view` 控制 `/admin/company/registry` 视图；
  - `company.admin.applications` 为申请审批列表；
  - `company.admin.config` 覆盖行业与类型配置接口；
  - `company.admin.applications.manage` 可在流程中推进应用状态（如新增动作时）。
- 通知/日志：
  - 每次状态变更应写入统一审计日志并可触发通知（邮件/站内信）。

## 数据迁移与可扩展性
- 保留原有玩家表结构，新增外键关联到 `CompanyEntity`。
- 通过 `workflow_state` 字段记录最新状态，但所有审核记录保存在独立表，便于溯源。
- 为后续业务复用，`WorkflowState` 相关逻辑应封装在共享模块，不仅为公司审核提供能力。
