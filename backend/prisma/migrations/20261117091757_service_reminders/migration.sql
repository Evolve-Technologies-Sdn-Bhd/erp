-- AlterTable
ALTER TABLE `mdm_item` ADD COLUMN `serviceIntervalMonths` INTEGER NULL;

-- AlterTable
ALTER TABLE `svc_job` ADD COLUMN `reminderId` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `svc_reminder` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `branchCode` VARCHAR(10) NOT NULL,
    `customerCode` VARCHAR(20) NOT NULL,
    `customerName` VARCHAR(150) NOT NULL,
    `contactName` VARCHAR(100) NULL,
    `phone` VARCHAR(40) NULL,
    `siteAddress` VARCHAR(300) NULL,
    `area` VARCHAR(60) NULL,
    `itemCode` VARCHAR(30) NOT NULL,
    `itemName` VARCHAR(150) NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `uomCode` VARCHAR(10) NOT NULL,
    `intervalMonths` INTEGER NOT NULL,
    `lastDoneOn` DATE NOT NULL,
    `dueOn` DATE NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'UPCOMING',
    `fromJobId` CHAR(36) NOT NULL,
    `fromJobNo` VARCHAR(30) NOT NULL,
    `jobId` CHAR(36) NULL,
    `jobNo` VARCHAR(30) NULL,
    `dismissReason` VARCHAR(300) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(20) NOT NULL,

    INDEX `svc_reminder_tenantId_status_dueOn_idx`(`tenantId`, `status`, `dueOn`),
    UNIQUE INDEX `svc_reminder_tenantId_fromJobId_itemCode_key`(`tenantId`, `fromJobId`, `itemCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
