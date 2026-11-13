-- CreateTable
CREATE TABLE `mdm_package` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `uomCode` VARCHAR(10) NOT NULL,
    `salesTaxCode` VARCHAR(10) NOT NULL,
    `priceListCode` VARCHAR(20) NOT NULL,
    `packagePrice` DECIMAL(18, 2) NOT NULL,
    `giftRule` VARCHAR(12) NOT NULL DEFAULT 'NONE',
    `runsFrom` DATE NOT NULL,
    `runsUntil` DATE NULL,
    `endedOn` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdBy` VARCHAR(20) NULL,
    `updatedBy` VARCHAR(20) NULL,

    INDEX `mdm_package_tenantId_runsFrom_idx`(`tenantId`, `runsFrom`),
    UNIQUE INDEX `mdm_package_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mdm_package_item` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `packageCode` VARCHAR(20) NOT NULL,
    `itemCode` VARCHAR(30) NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `uomCode` VARCHAR(10) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `mdm_package_item_tenantId_packageCode_idx`(`tenantId`, `packageCode`),
    INDEX `mdm_package_item_tenantId_itemCode_idx`(`tenantId`, `itemCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mdm_package_gift` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `packageCode` VARCHAR(20) NOT NULL,
    `itemCode` VARCHAR(30) NOT NULL,
    `qty` DECIMAL(18, 4) NOT NULL,
    `uomCode` VARCHAR(10) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `mdm_package_gift_tenantId_packageCode_idx`(`tenantId`, `packageCode`),
    INDEX `mdm_package_gift_tenantId_itemCode_idx`(`tenantId`, `itemCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
