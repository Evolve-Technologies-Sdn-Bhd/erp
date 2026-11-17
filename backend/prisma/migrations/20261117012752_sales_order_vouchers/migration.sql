-- AlterTable
ALTER TABLE `sal_invoice` ADD COLUMN `voucherTotal` DECIMAL(18, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `sal_sales_order` ADD COLUMN `voucherTotal` DECIMAL(18, 2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `sal_order_voucher` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `salesOrderId` CHAR(36) NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `voucherNo` VARCHAR(30) NOT NULL,
    `description` VARCHAR(100) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `taxCode` VARCHAR(20) NOT NULL,
    `taxRate` DECIMAL(7, 4) NOT NULL,
    `taxAmount` DECIMAL(18, 2) NOT NULL,
    `invoiceId` CHAR(36) NULL,
    `invoiceNo` VARCHAR(30) NULL,

    INDEX `sal_order_voucher_tenantId_voucherNo_idx`(`tenantId`, `voucherNo`),
    INDEX `sal_order_voucher_tenantId_invoiceId_idx`(`tenantId`, `invoiceId`),
    UNIQUE INDEX `sal_order_voucher_salesOrderId_voucherNo_key`(`salesOrderId`, `voucherNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sal_order_voucher` ADD CONSTRAINT `sal_order_voucher_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `sal_sales_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
