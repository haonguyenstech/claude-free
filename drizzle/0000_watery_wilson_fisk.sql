CREATE TABLE `access_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`request_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `disabled_models` (
	`model_id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`token` text,
	`model` text,
	`backend` text,
	`status` integer,
	`latency_ms` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`stream` integer
);
--> statement-breakpoint
CREATE INDEX `idx_request_logs_ts` ON `request_logs` (`ts`);--> statement-breakpoint
CREATE INDEX `idx_request_logs_backend` ON `request_logs` (`backend`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
