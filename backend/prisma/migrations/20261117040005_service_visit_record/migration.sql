-- AlterTable
ALTER TABLE `svc_job` ADD COLUMN `arrivedAt` CHAR(5) NULL,
    ADD COLUMN `finishedAt` CHAR(5) NULL,
    ADD COLUMN `followUpOfId` CHAR(36) NULL,
    ADD COLUMN `followUpOfNo` VARCHAR(30) NULL,
    ADD COLUMN `notPaidReason` VARCHAR(300) NULL,
    ADD COLUMN `paidMethod` VARCHAR(20) NULL,
    ADD COLUMN `paidStatus` VARCHAR(10) NULL,
    ADD COLUMN `postponedCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `recordedAt` DATETIME(3) NULL,
    ADD COLUMN `recordedBy` VARCHAR(100) NULL,
    ADD COLUMN `result` VARCHAR(12) NULL,
    ADD COLUMN `resultReason` VARCHAR(300) NULL;
