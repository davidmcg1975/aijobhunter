-- Users' own API keys, encrypted (see src/lib/security/encryption.ts), and a
-- flag so spend on a user's own key is not counted against the shared budget.
CREATE TABLE IF NOT EXISTS "ApiCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "hint" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApiCredential_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiCredential_userId_provider_key"
    ON "ApiCredential"("userId", "provider");
ALTER TABLE "AiUsage" ADD COLUMN IF NOT EXISTS "ownKey" BOOLEAN NOT NULL DEFAULT false;
