-- AlterTable
ALTER TABLE `sal_sales_order` ADD COLUMN `lapseWarnedAt` DATETIME(3) NULL,
    ADD COLUMN `lapsedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `sal_setting` ADD COLUMN `autoCancel` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `autoCancelDays` INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE `svc_job` ADD COLUMN `agentCode` VARCHAR(20) NULL,
    ADD COLUMN `agentName` VARCHAR(100) NULL,
    ADD COLUMN `atRiskNote` VARCHAR(300) NULL,
    ADD COLUMN `atRiskSince` DATETIME(3) NULL,
    ADD COLUMN `warehouseCode` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `sys_notification` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `userCode` VARCHAR(20) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` VARCHAR(1000) NOT NULL,
    `link` VARCHAR(300) NULL,
    `entityType` VARCHAR(30) NULL,
    `entityId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `readAt` DATETIME(3) NULL,

    INDEX `sys_notification_tenantId_userCode_readAt_idx`(`tenantId`, `userCode`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
