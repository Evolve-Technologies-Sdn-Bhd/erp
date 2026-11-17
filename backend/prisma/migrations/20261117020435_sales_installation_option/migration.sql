-- AlterTable
ALTER TABLE `sal_sales_order` ADD COLUMN `installAfterStock` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `installDate` DATE NULL,
    ADD COLUMN `installOption` VARCHAR(12) NULL;

-- AlterTable
ALTER TABLE `sal_setting` ADD COLUMN `askInstallation` BOOLEAN NOT NULL DEFAULT false;
