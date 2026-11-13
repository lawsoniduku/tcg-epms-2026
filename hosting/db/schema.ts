import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const workspaces=sqliteTable('workspaces',{owner:text('owner').primaryKey(),version:integer('version').notNull(),payload:text('payload').notNull()});
export const acceptanceSessions=sqliteTable('acceptance_sessions',{token:text('token').primaryKey(),owner:text('owner').notNull(),actor:text('actor').notNull(),csrf:text('csrf').notNull(),expires:integer('expires').notNull()});
import {primaryKey} from 'drizzle-orm/sqlite-core';
export const workspaceItems=sqliteTable('workspace_items',{
  owner:text().notNull(),bucket:text().notNull(),item_id:text().notNull(),ordinal:integer().notNull(),payload:text().notNull()
},t=>[primaryKey({columns:[t.owner,t.bucket,t.item_id]})]);
export const workspaceReceipts=sqliteTable('workspace_receipts',{
  owner:text().notNull(),operation:text().notNull(),result:text().notNull(),expires:integer().notNull()
},t=>[primaryKey({columns:[t.owner,t.operation]})]);
