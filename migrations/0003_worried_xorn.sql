PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attributes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text,
	`value` integer,
	`character_id` integer,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_attributes`("id", "label", "value", "character_id") SELECT "id", "label", "value", "character_id" FROM `attributes`;--> statement-breakpoint
DROP TABLE `attributes`;--> statement-breakpoint
ALTER TABLE `__new_attributes` RENAME TO `attributes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;