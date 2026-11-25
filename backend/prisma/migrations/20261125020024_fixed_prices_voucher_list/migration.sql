-- AlterTable
ALTER TABLE `sal_setting` ADD COLUMN `fixedPrices` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `voucherControl` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `sal_voucher` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `voucherNo` VARCHAR(30) NOT NULL,
    `description` VARCHAR(100) NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `validFrom` DATE NOT NULL,
    `validUntil` DATE NULL,
    `maxUses` INTEGER NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(20) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `sal_voucher_tenantId_voucherNo_key`(`tenantId`, `voucherNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
