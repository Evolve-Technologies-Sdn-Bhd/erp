-- CreateTable
CREATE TABLE `sys_user_tutorial` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `mode` BOOLEAN NOT NULL DEFAULT true,
    `welcomeSeen` BOOLEAN NOT NULL DEFAULT false,
    `done` JSON NOT NULL,
    `active` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_user_tutorial_tenantId_userId_key`(`tenantId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
