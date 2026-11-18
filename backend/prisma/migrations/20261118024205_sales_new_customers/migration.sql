-- AlterTable
ALTER TABLE `mdm_customer` ADD COLUMN `toComplete` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `sal_setting` ADD COLUMN `agentsAddCustomers` BOOLEAN NOT NULL DEFAULT false;
