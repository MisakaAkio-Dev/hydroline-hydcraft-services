-- CreateTable
CREATE TABLE "attachment_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "path" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attachment_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "folderId" TEXT,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "hash" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "externalUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_tags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attachment_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_tagging" (
    "attachmentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attachment_tagging_pkey" PRIMARY KEY ("attachmentId", "tagId")
);

-- CreateTable
CREATE TABLE "attachment_share_tokens" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attachment_share_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_namespaces" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "config_namespaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_entries" (
    "id" TEXT NOT NULL,
    "namespaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "config_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attachment_folders_parentId_name_key" ON "attachment_folders"("parentId", "name");

-- CreateIndex
CREATE INDEX "idx_attachments_folder" ON "attachments"("folderId");

-- CreateIndex
CREATE INDEX "idx_attachments_owner" ON "attachments"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_tags_key_key" ON "attachment_tags"("key");

-- CreateIndex
CREATE INDEX "attachment_tagging_attachmentId_idx" ON "attachment_tagging"("attachmentId");

-- CreateIndex
CREATE INDEX "attachment_tagging_tagId_idx" ON "attachment_tagging"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_share_tokens_token_key" ON "attachment_share_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_attachment_share_tokens_attachment" ON "attachment_share_tokens"("attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "config_namespaces_key_key" ON "config_namespaces"("key");

-- CreateIndex
CREATE UNIQUE INDEX "config_entries_namespaceId_key_key" ON "config_entries"("namespaceId", "key");

-- CreateIndex
CREATE INDEX "idx_config_entries_namespace" ON "config_entries"("namespaceId");

-- AddForeignKey
ALTER TABLE "attachment_folders" ADD CONSTRAINT "attachment_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "attachment_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_folders" ADD CONSTRAINT "attachment_folders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "attachment_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_tags" ADD CONSTRAINT "attachment_tags_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_tagging" ADD CONSTRAINT "attachment_tagging_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_tagging" ADD CONSTRAINT "attachment_tagging_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "attachment_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_tagging" ADD CONSTRAINT "attachment_tagging_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_share_tokens" ADD CONSTRAINT "attachment_share_tokens_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment_share_tokens" ADD CONSTRAINT "attachment_share_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_entries" ADD CONSTRAINT "config_entries_namespaceId_fkey" FOREIGN KEY ("namespaceId") REFERENCES "config_namespaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_entries" ADD CONSTRAINT "config_entries_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
