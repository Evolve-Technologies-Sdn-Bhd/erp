-- AlterTable
ALTER TABLE `sal_setting` ADD COLUMN `autoInvoice` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `receiptsPayInvoices` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `sal_receipt_allocation` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `receiptId` CHAR(36) NOT NULL,
    `receiptNo` VARCHAR(30) NOT NULL,
    `paidOn` DATE NOT NULL,
    `method` VARCHAR(12) NOT NULL,
    `invoiceId` CHAR(36) NOT NULL,
    `invoiceNo` VARCHAR(30) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(20) NOT NULL,

    INDEX `sal_receipt_allocation_tenantId_invoiceNo_idx`(`tenantId`, `invoiceNo`),
    UNIQUE INDEX `sal_receipt_allocation_receiptId_invoiceId_key`(`receiptId`, `invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
