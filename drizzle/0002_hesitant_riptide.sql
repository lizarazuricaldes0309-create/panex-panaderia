CREATE TABLE `customerAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(40),
	`passwordHash` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastLoginAt` timestamp,
	CONSTRAINT `customerAccounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `customerAccounts_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `customerSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customerSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `customerSessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
