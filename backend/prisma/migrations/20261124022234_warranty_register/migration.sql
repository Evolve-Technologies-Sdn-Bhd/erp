-- AlterTable
ALTER TABLE `mdm_item` ADD COLUMN `warrantyMonths` INTEGER NULL;

-- AlterTable
ALTER TABLE `svc_job` ADD COLUMN `assessNote` VARCHAR(300) NULL,
    ADD COLUMN `assessedAt` DATETIME(3) NULL,
    ADD COLUMN `assessedBy` VARCHAR(100) NULL,
    ADD COLUMN `assessment` VARCHAR(12) NULL,
    ADD COLUMN `warrantyId` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `svc_warranty` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `branchCode` VARCHAR(10) NOT NULL,
    `customerCode` VARCHAR(20) NOT NULL,
    `customerName` VARCHAR(150) NOT NULL,
    `contactName` VARCHAR(100) NULL,
    `phone` VARCHAR(40) NULL,
    `phoneKey` VARCHAR(40) NULL,
    `siteAddress` VARCHAR(300) NULL,
    `area` VARCHAR(60) NULL,
    `salesOrderId` CHAR(36) NULL,
    `salesOrderNo` VARCHAR(30) NULL,
    `jobId` CHAR(36) NOT NULL,
    `jobNo` VARCHAR(30) NOT NULL,
    `itemCode` VARCHAR(30) NOT NULL,
    `itemName` VARCHAR(150) NOT NULL,
    `uomCode` VARCHAR(10) NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `serialNo` VARCHAR(60) NULL,
    `warrantyMonths` INTEGER NOT NULL,
    `startOn` DATE NOT NULL,
    `endOn` DATE NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    `activatedAt` DATETIME(3) NULL,
    `voidReason` VARCHAR(300) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(20) NOT NULL,

    INDEX `svc_warranty_tenantId_status_endOn_idx`(`tenantId`, `status`, `endOn`),
    INDEX `svc_warranty_tenantId_salesOrderId_idx`(`tenantId`, `salesOrderId`),
    INDEX `svc_warranty_tenantId_customerCode_idx`(`tenantId`, `customerCode`),
    UNIQUE INDEX `svc_warranty_jobId_itemCode_key`(`jobId`, `itemCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `svc_job_part` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `jobId` CHAR(36) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `itemCode` VARCHAR(30) NOT NULL,
    `itemName` VARCHAR(150) NOT NULL,
    `uomCode` VARCHAR(10) NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,

    INDEX `svc_job_part_tenantId_itemCode_idx`(`tenantId`, `itemCode`),
    UNIQUE INDEX `svc_job_part_jobId_lineNo_key`(`jobId`, `lineNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `svc_job_part` ADD CONSTRAINT `svc_job_part_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `svc_job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
