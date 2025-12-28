# 20251229_enum_update

目的：修复 PostgreSQL 中 `CompanyCategory` 枚举从旧值（`ENTERPRISE`, `ORGANIZATION`）迁移到新值（`FOR_PROFIT_LEGAL_PERSONS`, `NON_PROFIT_LEGAL_PERSONS`）时导致的 `prisma db push` 失败。

当前保留的脚本：

- `ensure_companycategory_values.sql`：仅在数据库中添加缺失的枚举标签（可多次安全运行）。
- `update_old_companycategory_values.sql`：在枚举值已提交后将表中旧值替换为新值。

已删除（冗余/合并导致事务可见性问题）：

- `add_enum_values_then_update.sql`（合并脚本会因 "new enum values must be committed" 问题失败）
- `fix_company_category.sql`（旧版，已被拆分为上面两个脚本）

推荐的生产迁移步骤（严格按序操作）：

1. 备份数据库（务必在生产环境执行前完成）。示例：

```powershell
$env:DATABASE_URL="postgresql://user:pass@host:5432/hydrolinehydc"
pg_dump $env:DATABASE_URL -Fc -f backup-$(Get-Date -Format yyyyMMddHHmm).dump
```

2. 在维护窗口进行：先在非生产环境（staging）执行并验证。确认无问题后，在生产环境执行下面命令。

3. 添加 enum 值（此步骤必须在单独的提交中完成，不能和 UPDATE 同一事务）：

推荐（优先）：使用 `psql` 直接运行（避免事务包装导致的可见性/安全错误）：

```powershell
psql $env:DATABASE_URL -f prisma/scripts/20251229_enum_update/ensure_companycategory_values.sql
```

可选：若你能保证 `prisma db execute` 不会将 ALTER TYPE 包在未提交的事务中，也可：

```bash
pnpm exec prisma db execute --schema=prisma/schema.prisma --file=prisma/scripts/20251229_enum_update/ensure_companycategory_values.sql
```

4. 更新表中旧值为新值（在第 3 步完成并提交后运行）：

```bash
pnpm exec prisma db execute --schema=prisma/schema.prisma --file=prisma/scripts/20251229_enum_update/update_old_companycategory_values.sql
```

或使用 `psql`：

```powershell
psql $env:DATABASE_URL -f prisma/scripts/20251229_enum_update/update_old_companycategory_values.sql
```

5. 运行 `pnpm db:push` 将 Prisma 模式变更推送到数据库：

```bash
pnpm db:push
```

6. 验证：检查相关表是否没有旧值残留（示例）：

```sql
SELECT category, count(*) FROM companies GROUP BY category;
SELECT category, count(*) FROM company_types GROUP BY category;
```

回滚与风险：

- 在第3步前必须备份；若第4步误操作可用备份恢复或针对受影响行恢复旧值（需人工评估）。
- ALTER TYPE ADD VALUE 是不可逆的（值一旦添加不能删除），但这是安全操作（添加新标签本身不会破坏数据）。

其他注意事项：

- 避免将 `ALTER TYPE ... ADD VALUE` 与同一事务中的 `UPDATE` 或 `ALTER TABLE` 混合执行（Postgres 对新值的可见性有限制）。
- 若数据库连接有只读复制或延迟复制，建议在主库上直接执行并在应用层短时停止写操作。

如果需要，我可以：

- 在你提供的凭据或在你本地终端上按步骤执行（你粘贴输出给我）。
- 把 README 中的命令改成你实际的 CI/运维脚本格式。
