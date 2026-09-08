CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshot_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL,
	`ordinal` integer NOT NULL,
	`value` text NOT NULL
);
