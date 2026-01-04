-- Ensure enums exist (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OAuthLogAction') THEN
        CREATE TYPE "OAuthLogAction" AS ENUM ('AUTHORIZE', 'TOKEN', 'LOGIN', 'REGISTER', 'BIND', 'UNBIND', 'ERROR');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OAuthLogStatus') THEN
        CREATE TYPE "OAuthLogStatus" AS ENUM ('SUCCESS', 'FAILURE');
    END IF;
END $$;

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "oauth_providers" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "oauth_providers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "oauth_logs" (
    "id" TEXT NOT NULL,
    "providerId" TEXT,
    "providerKey" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "action" "OAuthLogAction" NOT NULL,
    "status" "OAuthLogStatus" NOT NULL,
    "userId" TEXT,
    "accountId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oauth_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "oauth_states" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- Indexes (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_providers_key_key" ON "oauth_providers"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_states_state_key" ON "oauth_states"("state");
CREATE INDEX IF NOT EXISTS "idx_oauth_state_expiry" ON "oauth_states"("expiresAt");
CREATE INDEX IF NOT EXISTS "idx_oauth_log_provider_key" ON "oauth_logs"("providerKey", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_oauth_log_user" ON "oauth_logs"("userId", "createdAt");

-- Foreign keys (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_logs_providerId_fkey') THEN
        ALTER TABLE "oauth_logs"
            ADD CONSTRAINT "oauth_logs_providerId_fkey"
            FOREIGN KEY ("providerId") REFERENCES "oauth_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_logs_userId_fkey') THEN
        ALTER TABLE "oauth_logs"
            ADD CONSTRAINT "oauth_logs_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_logs_accountId_fkey') THEN
        ALTER TABLE "oauth_logs"
            ADD CONSTRAINT "oauth_logs_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

