-- AlterTable
ALTER TABLE `svc_person` ADD COLUMN `claimsFees` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `svc_slot_group` ADD COLUMN `feeAmount` DECIMAL(18, 2) NULL;

-- CreateTable
CREATE TABLE `svc_claim` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `docNo` VARCHAR(30) NOT NULL,
    `branchCode` VARCHAR(10) NOT NULL,
    `personId` CHAR(36) NOT NULL,
    `personName` VARCHAR(100) NOT NULL,
    `periodStart` DATE NOT NULL,
    `periodEnd` DATE NOT NULL,
    `payOn` DATE NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `invoiceNo` VARCHAR(40) NULL,
    `selfBilled` BOOLEAN NOT NULL DEFAULT false,
    `total` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `note` VARCHAR(500) NULL,
    `submittedAt` DATETIME(3) NULL,
    `submittedBy` VARCHAR(20) NULL,
    `submittedByName` VARCHAR(100) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decidedByName` VARCHAR(100) NULL,
    `returnReason` VARCHAR(300) NULL,
    `paidOn` DATE NULL,
    `paymentRef` VARCHAR(40) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(20) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(20) NOT NULL,

    INDEX `svc_claim_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `svc_claim_tenantId_personId_periodStart_idx`(`tenantId`, `personId`, `periodStart`),
    UNIQUE INDEX `svc_claim_tenantId_docNo_key`(`tenantId`, `docNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `svc_claim_line` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `claimId` CHAR(36) NOT NULL,
    `jobId` CHAR(36) NOT NULL,
    `jobNo` VARCHAR(30) NOT NULL,
    `jobType` VARCHAR(20) NOT NULL,
    `customerName` VARCHAR(150) NOT NULL,
    `salesOrderNo` VARCHAR(30) NULL,
    `categoryName` VARCHAR(60) NULL,
    `doneOn` DATE NOT NULL,
    `late` BOOLEAN NOT NULL DEFAULT false,
    `referenceAmount` DECIMAL(18, 2) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `reason` VARCHAR(300) NULL,

    INDEX `svc_claim_line_tenantId_jobId_idx`(`tenantId`, `jobId`),
    UNIQUE INDEX `svc_claim_line_claimId_jobId_key`(`claimId`, `jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `svc_claim_line` ADD CONSTRAINT `svc_claim_line_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `svc_claim`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Installers claim a fee per job with their own invoice; technicians and warranty staff do not (F5).
UPDATE `svc_person` SET `claimsFees` = true WHERE `role` = 'INSTALLER';
