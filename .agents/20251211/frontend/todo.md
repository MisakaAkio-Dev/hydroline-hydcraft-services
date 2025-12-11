# 前端 TODO
- [x] 确保 `/company/dashboard` 仅在登录＋持有者/法人身份时调用 API，所有请求继承 `apiFetch` 的 token 与自动刷新机制。
- [x] 重新设计 `/admin/company/registry` 表格、分页与动作面板，移除 `UFormGroup` 依赖并与 `/admin/company/applications` 联动。
- [x] 为工商配置补充 `/admin/company/industries`、`/admin/company/types` 与 `/admin/company/applications` 视图与对应的 Pinia store。
- [x] 补全行业/类型/申请视图的表格、表单与通知提示，保持 Nuxt UI + slate/primary 风格。
- [ ] 若需进一步引入 ECharts 或 motion 组件，可在下个迭代中沿用相同视觉基调。
