-- AlterTable
ALTER TABLE `mdm_item` ADD COLUMN `pictureId` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `mdm_package` ADD COLUMN `category` VARCHAR(50) NULL,
    ADD COLUMN `pictureId` CHAR(36) NULL,
    ADD COLUMN `terms` TEXT NULL,
    MODIFY `code` VARCHAR(30) NOT NULL;

-- AlterTable
ALTER TABLE `mdm_package_gift` MODIFY `packageCode` VARCHAR(30) NOT NULL;

-- AlterTable
ALTER TABLE `mdm_package_item` MODIFY `packageCode` VARCHAR(30) NOT NULL;

-- AlterTable
ALTER TABLE `sal_sales_order_line` MODIFY `packageCode` VARCHAR(30) NULL;

-- CreateTable
CREATE TABLE `mdm_package_category` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdBy` VARCHAR(20) NULL,
    `updatedBy` VARCHAR(20) NULL,

    UNIQUE INDEX `mdm_package_category_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
