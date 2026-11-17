-- CreateTable
CREATE TABLE `svc_job` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `docNo` VARCHAR(30) NOT NULL,
    `jobType` ENUM('INSTALLATION', 'SERVICE', 'WARRANTY', 'REPAIR') NOT NULL,
    `stage` ENUM('NOT_BOOKED', 'BOOKED', 'ACCEPTED', 'DONE', 'CHECKED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'NOT_BOOKED',
    `branchCode` VARCHAR(10) NOT NULL,
    `customerCode` VARCHAR(20) NOT NULL,
    `customerName` VARCHAR(150) NOT NULL,
    `contactName` VARCHAR(100) NULL,
    `phone` VARCHAR(40) NULL,
    `siteAddress` VARCHAR(300) NULL,
    `area` VARCHAR(60) NULL,
    `source` VARCHAR(12) NOT NULL DEFAULT 'MANUAL',
    `salesOrderId` CHAR(36) NULL,
    `salesOrderNo` VARCHAR(30) NULL,
    `preferredDate` DATE NULL,
    `afterStock` BOOLEAN NOT NULL DEFAULT false,
    `note` TEXT NULL,
    `cancelReason` VARCHAR(300) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(20) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(20) NOT NULL,

    INDEX `svc_job_tenantId_stage_idx`(`tenantId`, `stage`),
    INDEX `svc_job_tenantId_customerCode_idx`(`tenantId`, `customerCode`),
    UNIQUE INDEX `svc_job_tenantId_docNo_key`(`tenantId`, `docNo`),
    UNIQUE INDEX `svc_job_tenantId_salesOrderId_key`(`tenantId`, `salesOrderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `svc_job_item` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `jobId` CHAR(36) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `itemCode` VARCHAR(30) NOT NULL,
    `itemName` VARCHAR(150) NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `uomCode` VARCHAR(10) NOT NULL,
    `serialNo` VARCHAR(60) NULL,

    INDEX `svc_job_item_tenantId_itemCode_idx`(`tenantId`, `itemCode`),
    UNIQUE INDEX `svc_job_item_jobId_lineNo_key`(`jobId`, `lineNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `svc_job_item` ADD CONSTRAINT `svc_job_item_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `svc_job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
