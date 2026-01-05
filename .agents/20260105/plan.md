# 公司模块拆分阶段提醒（2026-01-05）

1. **阶段 1：洞察与切分策略**
   - 复盘 `company.service.ts` 的功能区域（元数据、目录、世界行政区、申请、审批、管理员、LLC 相关、辅助工具等）
   - 确定每个模块的边界与最小职责，计划分拆后的新文件夹结构
   - 记录迁移顺序，避免一次性动全盘

2. **阶段 2：逐步拆分与抽象**
  - 按区域创建新 service/worker 文件（如 `company/meta`、`company/geo`、`company/application`、`company/admin`）
  - 逐步将方法迁移到对应 service，保持 `CompanyService` 作为协调层
  - 每完成一组拆分就运行 `pnpm --filter backend build` 验证当前注入链
  - 当前重点：完成“公司申请/审批”逻辑的独立 service，然后再处理“管理员审批/登记机关”相关块
  - 2A：先从 `company.service.ts` 把“申请人/参与人/审批流水”相关方法抜出到新的 `CompanyApplicationService`，保留 `CompanyService` 轻量委托，分阶段迁移 `create*Application`、consent 处理、settings、admin actions 以及所有 init/validation helper
  - 2B：已为通用 helper 创建 `CompanySupportService`，并把 consent/listing/withdraw 相关流转初步迁入 `CompanyApplicationService`（通过委托减小 `CompanyService` 体量），下一步继续拆出 `create*Application` 与 admin workflow/sdk 逻辑

3. **阶段 3：整合与验证**
   - 更新 `company.module.ts`，将拆分后的服务注入并导出需要共享的 service
   - 校对所有 controller/其它 modules 的依赖，确保接口未改变
   - 执行 `pnpm --filter backend build` 进行后端测试验证
   - 撰写拆分说明并补充必要文档（如 README 的拆分说明）

> 先把阶段一搞透再动下一步，确保拆分顺序明确、代码能跑。拆分过程中若遇卡点，记录在此文件以便回顾。
