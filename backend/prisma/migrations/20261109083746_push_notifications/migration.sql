/*
  Warnings:

  - Added the required column `updatedAt` to the `PushToken` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minSeverity" TEXT NOT NULL DEFAULT 'warning',
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PushToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PushToken" ("createdAt", "id", "platform", "token") SELECT "createdAt", "id", "platform", "token" FROM "PushToken";
DROP TABLE "PushToken";
ALTER TABLE "new_PushToken" RENAME TO "PushToken";
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
