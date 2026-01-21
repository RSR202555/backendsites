-- AlterTable
ALTER TABLE `Payment` MODIFY `provider` ENUM('STRIPE', 'ASAAS', 'MANUAL') NOT NULL;
