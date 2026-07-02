CREATE TABLE `model_tests` (
	`model_id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`ok` integer NOT NULL,
	`status` integer,
	`latency_ms` integer,
	`sample` text,
	`error` text,
	`tps` real
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`model_id` text PRIMARY KEY NOT NULL,
	`ts` integer NOT NULL,
	`status` integer,
	`requests_remaining` integer,
	`requests_limit` integer,
	`tokens_remaining` integer,
	`tokens_limit` integer,
	`reset_at` integer,
	`retry_after` integer
);
--> statement-breakpoint
ALTER TABLE `access_tokens` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `request_logs` ADD `ttft_ms` integer;--> statement-breakpoint
ALTER TABLE `request_logs` ADD `cost_usd` real;