-- AlterTable
ALTER TABLE `sal_setting` ADD COLUMN `officeDraftsQuotations` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `useEnquiries` BOOLEAN NOT NULL DEFAULT true;
