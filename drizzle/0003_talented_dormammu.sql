CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`productId` int NOT NULL,
	`rating` int NOT NULL,
	`comment` text NOT NULL,
	`status` enum('aprobada','pendiente','rechazada') NOT NULL DEFAULT 'aprobada',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `customerAccounts` ADD `emailVerified` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customerAccounts` ADD `verificationCodeHash` varchar(128);--> statement-breakpoint
ALTER TABLE `customerAccounts` ADD `verificationExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `customerAccounts` ADD `verificationAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customerAccounts` ADD `loyaltyPoints` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customerAccounts` ADD `welcomeCouponCode` varchar(40);--> statement-breakpoint
ALTER TABLE `customerAccounts` ADD CONSTRAINT `customerAccounts_welcomeCouponCode_unique` UNIQUE(`welcomeCouponCode`);