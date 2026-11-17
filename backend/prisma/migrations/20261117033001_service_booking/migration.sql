-- AlterTable
ALTER TABLE `svc_job` ADD COLUMN `bookedAt` DATETIME(3) NULL,
    ADD COLUMN `closedAt` DATETIME(3) NULL,
    ADD COLUMN `doneAt` DATETIME(3) NULL,
    ADD COLUMN `doneNote` VARCHAR(500) NULL,
    ADD COLUMN `jobDate` DATE NULL,
    ADD COLUMN `personId` CHAR(36) NULL,
    ADD COLUMN `personName` VARCHAR(100) NULL,
    ADD COLUMN `slotEnd` INTEGER NULL,
    ADD COLUMN `slotGroupCode` VARCHAR(20) NULL,
    ADD COLUMN `slotStart` INTEGER NULL;

-- CreateTable
CREATE TABLE `svc_person` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `role` VARCHAR(12) NOT NULL,
    `phone` VARCHAR(40) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(20) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(20) NOT NULL,

    INDEX `svc_person_tenantId_isActive_idx`(`tenantId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `svc_slot_group` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `slotMinutes` INTEGER NOT NULL,
    `firstStart` INTEGER NOT NULL,
    `lastEnd` INTEGER NOT NULL,
    `jobTypes` VARCHAR(60) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `svc_slot_group_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `svc_job_tenantId_personId_jobDate_idx` ON `svc_job`(`tenantId`, `personId`, `jobDate`);

-- CreateIndex
CREATE INDEX `svc_job_tenantId_jobDate_idx` ON `svc_job`(`tenantId`, `jobDate`);
