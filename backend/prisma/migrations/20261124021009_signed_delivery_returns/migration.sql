-- AlterTable
ALTER TABLE `sal_delivery` ADD COLUMN `collectedAt` DATETIME(3) NULL,
    ADD COLUMN `collectedByName` VARCHAR(100) NULL,
    ADD COLUMN `refuseReason` VARCHAR(300) NULL,
    ADD COLUMN `refuseReturned` VARCHAR(300) NULL,
    ADD COLUMN `refusedAt` DATETIME(3) NULL,
    ADD COLUMN `refusedByCode` VARCHAR(20) NULL,
    ADD COLUMN `refusedByName` VARCHAR(100) NULL,
    ADD COLUMN `signedAt` DATETIME(3) NULL,
    ADD COLUMN `signerName` VARCHAR(100) NULL,
    ADD COLUMN `unsignedByName` VARCHAR(100) NULL;

-- AlterTable
ALTER TABLE `sal_setting` ADD COLUMN `signedDelivery` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `svc_job` ADD COLUMN `deliveredAt` DATETIME(3) NULL,
    ADD COLUMN `unfinishedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `svc_return` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `branchCode` VARCHAR(10) NOT NULL,
    `jobId` CHAR(36) NOT NULL,
    `jobNo` VARCHAR(30) NOT NULL,
    `customerName` VARCHAR(150) NOT NULL,
    `personName` VARCHAR(100) NULL,
    `warehouseCode` VARCHAR(20) NULL,
    `itemCode` VARCHAR(30) NOT NULL,
    `itemName` VARCHAR(150) NOT NULL,
    `uomCode` VARCHAR(10) NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `goodQty` DECIMAL(18, 4) NULL,
    `damagedQty` DECIMAL(18, 4) NULL,
    `note` VARCHAR(300) NULL,
    `receivedAt` DATETIME(3) NULL,
    `receivedBy` VARCHAR(100) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(20) NOT NULL,

    INDEX `svc_return_tenantId_receivedAt_idx`(`tenantId`, `receivedAt`),
    UNIQUE INDEX `svc_return_jobId_itemCode_key`(`jobId`, `itemCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
