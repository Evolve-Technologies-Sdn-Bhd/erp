-- AlterTable
ALTER TABLE `mdm_customer` ADD COLUMN `pendingAgentCode` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `mdm_customer_transfer` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `customerId` CHAR(36) NOT NULL,
    `customerCode` VARCHAR(20) NOT NULL,
    `customerName` VARCHAR(150) NOT NULL,
    `fromAgentCode` VARCHAR(20) NULL,
    `fromAgentName` VARCHAR(100) NULL,
    `toAgentCode` VARCHAR(20) NOT NULL,
    `toAgentName` VARCHAR(100) NOT NULL,
    `toBranchCode` VARCHAR(10) NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    `decidedBy` VARCHAR(100) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` VARCHAR(300) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(20) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(20) NOT NULL,

    INDEX `mdm_customer_transfer_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `mdm_customer_transfer_tenantId_customerId_idx`(`tenantId`, `customerId`),
    INDEX `mdm_customer_transfer_tenantId_toAgentCode_idx`(`tenantId`, `toAgentCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `mdm_customer_tenantId_pendingAgentCode_idx` ON `mdm_customer`(`tenantId`, `pendingAgentCode`);
