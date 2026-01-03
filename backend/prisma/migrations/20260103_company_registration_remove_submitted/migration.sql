-- 目的：
-- - 注册流程（company.registration）不再保留 SUBMITTED/submitted 环节
-- - 将存量数据统一迁移到 UNDER_REVIEW/under_review，避免流程实例找不到状态或卡死

BEGIN;

-- 1) 迁移注册流程实例：submitted -> under_review
UPDATE "workflow_instances"
SET "currentState" = 'under_review'
WHERE "definitionCode" = 'company.registration'
  AND "currentState" = 'submitted';

-- 2) 迁移注册申请记录：SUBMITTED/submitted -> UNDER_REVIEW/under_review
UPDATE "company_applications" AS a
SET
  "status" = 'UNDER_REVIEW',
  "currentStage" = 'under_review'
FROM "workflow_instances" AS i
WHERE a."workflowInstanceId" = i."id"
  AND i."definitionCode" = 'company.registration'
  AND (
    a."status" = 'SUBMITTED'
    OR a."currentStage" = 'submitted'
  );

-- 3) 同步注册流程定义字段（非必须，但可减少历史配置影响）
UPDATE "workflow_definitions"
SET
  "initialState" = 'under_review',
  "states" = array_remove("states", 'submitted')
WHERE "code" = 'company.registration';

COMMIT;


