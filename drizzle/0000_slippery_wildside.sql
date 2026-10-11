CREATE TABLE `vc_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`operation` text NOT NULL,
	`account_id` text,
	`status` text NOT NULL,
	`error_code` text,
	`duration_ms` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vc_activity_owner_date` ON `vc_activity` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `vc_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`source_url` text NOT NULL,
	`notes` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vc_contact_source` ON `vc_contacts` (`owner`,`source_url`);--> statement-breakpoint
CREATE TABLE `vc_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`operation` text NOT NULL,
	`payload` text NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vc_draft_dedupe` ON `vc_drafts` (`owner`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `vc_draft_owner` ON `vc_drafts` (`owner`);--> statement-breakpoint
CREATE TABLE `vc_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`provider` text NOT NULL,
	`base_url` text NOT NULL,
	`encrypted_key` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vc_provider_owner` ON `vc_providers` (`owner`,`provider`);--> statement-breakpoint
CREATE TABLE `vc_rate_buckets` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vc_suppressions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`recipient` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vc_suppression_owner_recipient` ON `vc_suppressions` (`owner`,`recipient`);