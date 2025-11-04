-- CreateTable
CREATE TABLE "user_authme_binding" (
    "user_id" TEXT NOT NULL,
    "authme_username" TEXT NOT NULL,
    "authme_username_lower" TEXT NOT NULL,
    "authme_realname" TEXT,
    "bound_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bound_by_user_id" TEXT,
    "bound_by_ip" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_authme_binding_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_authme_binding_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_authme_binding_bound_by_user_id_fkey" FOREIGN KEY ("bound_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_authme_binding_authme_username_lower_key" ON "user_authme_binding"("authme_username_lower");

-- CreateIndex
CREATE INDEX "idx_authme_binding_username_lower" ON "user_authme_binding"("authme_username_lower");
