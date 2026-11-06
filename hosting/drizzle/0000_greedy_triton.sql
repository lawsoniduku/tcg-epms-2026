CREATE TABLE `acceptance_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`actor` text NOT NULL,
	`csrf` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`owner` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`payload` text NOT NULL
);
