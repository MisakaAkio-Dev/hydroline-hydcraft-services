# 后端 TODO
- [x] 提供 `/admin/company/config/industries` 与 `/admin/company/config/types` 接口，允许管理员维护行业与类型配置，并校验 `company.admin.config` 权限。
- [x] 支持 `/admin/company/applications` 分页接口，返回公司/申请人/流程/状态信息供前端审批列表消费。
- [x] 在 RBAC 权限集中加入 `company.admin.applications`、`company.admin.config` 等新 key，便于导航与接口守卫。
- [ ] 根据实际流程与运营反馈，继续梳理制度审批与推荐联动的 backend hook。
