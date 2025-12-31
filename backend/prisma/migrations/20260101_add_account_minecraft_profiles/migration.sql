-- CreateTable
CREATE TABLE "account_minecraft_profiles" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "javaName" TEXT,
    "javaUuid" TEXT,
    "bedrockGamertag" TEXT,
    "bedrockXuid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_minecraft_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_minecraft_profiles_accountId_key" ON "account_minecraft_profiles"("accountId");

-- AddForeignKey
ALTER TABLE "account_minecraft_profiles" ADD CONSTRAINT "account_minecraft_profiles_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
