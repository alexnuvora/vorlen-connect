import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const providers = sqliteTable('vc_providers', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), provider: text('provider').notNull(),
 baseUrl: text('base_url').notNull(), encryptedKey: text('encrypted_key').notNull(), updatedAt: text('updated_at').notNull()
}, t => [uniqueIndex('vc_provider_owner').on(t.owner, t.provider)]);
export const activity = sqliteTable('vc_activity', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), operation: text('operation').notNull(), accountId: text('account_id'),
 status: text('status').notNull(), errorCode: text('error_code'), durationMs: integer('duration_ms').notNull(), createdAt: text('created_at').notNull()
}, t => [index('vc_activity_owner_date').on(t.owner,t.createdAt)]);
export const drafts = sqliteTable('vc_drafts', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), operation: text('operation').notNull(), payload: text('payload').notNull(),
 fingerprint: text('fingerprint').notNull(), status: text('status').notNull(), result: text('result'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull()
}, t => [uniqueIndex('vc_draft_dedupe').on(t.owner,t.fingerprint), index('vc_draft_owner').on(t.owner)]);
export const contacts = sqliteTable('vc_contacts', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), name:text('name').notNull(), kind:text('kind').notNull(),
 sourceUrl:text('source_url').notNull(), notes:text('notes').notNull(), createdAt:text('created_at').notNull()
}, t => [uniqueIndex('vc_contact_source').on(t.owner,t.sourceUrl)]);
export const suppressions = sqliteTable('vc_suppressions', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), recipient:text('recipient').notNull(), reason:text('reason').notNull(), createdAt:text('created_at').notNull()
}, t => [uniqueIndex('vc_suppression_owner_recipient').on(t.owner,t.recipient)]);
export const rateBuckets = sqliteTable('vc_rate_buckets', {
 key:text('key').primaryKey(), count:integer('count').notNull(), expiresAt:integer('expires_at').notNull()
});
