CREATE TABLE `attributes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text,
	`character_id` integer,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action
);
