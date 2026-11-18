-- AlterTable
ALTER TABLE `sal_setting` ADD COLUMN `useReceipts` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `svc_job` ADD COLUMN `orderPaid` DECIMAL(18, 2) NULL,
    ADD COLUMN `orderPayment` VARCHAR(12) NULL,
    ADD COLUMN `orderTotal` DECIMAL(18, 2) NULL;

-- CreateTable
CREATE TABLE `sal_receipt` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `docNo` VARCHAR(30) NOT NULL,
    `docDate` DATE NOT NULL,
    `status` ENUM('WAITING', 'VERIFIED', 'RETURNED', 'CANCELLED') NOT NULL DEFAULT 'WAITING',
    `branchCode` VARCHAR(10) NOT NULL,
    `salesOrderId` CHAR(36) NOT NULL,
    `salesOrderNo` VARCHAR(30) NOT NULL,
    `customerCode` VARCHAR(20) NOT NULL,
    `customerName` VARCHAR(150) NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `method` VARCHAR(12) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `payerRef` VARCHAR(60) NULL,
    `note` VARCHAR(500) NULL,
    `recordedByCode` VARCHAR(20) NOT NULL,
    `recordedByName` VARCHAR(100) NOT NULL,
    `verifiedRef` VARCHAR(60) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `verifiedByCode` VARCHAR(20) NULL,
    `verifiedByName` VARCHAR(100) NULL,
    `returnReason` VARCHAR(300) NULL,
    `cancelReason` VARCHAR(300) NULL,
    `isMigrated` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(20) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(20) NOT NULL,

    INDEX `sal_receipt_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `sal_receipt_tenantId_salesOrderId_idx`(`tenantId`, `salesOrderId`),
    INDEX `sal_receipt_tenantId_customerCode_idx`(`tenantId`, `customerCode`),
    UNIQUE INDEX `sal_receipt_tenantId_docNo_key`(`tenantId`, `docNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
