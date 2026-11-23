-- AlterTable
ALTER TABLE `sal_sales_order` ADD COLUMN `isPreOrder` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `preOrderShort` VARCHAR(300) NULL;

-- AlterTable
ALTER TABLE `sal_setting` ADD COLUMN `preOrders` BOOLEAN NOT NULL DEFAULT false;
