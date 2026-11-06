import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const workspaces=sqliteTable('workspaces',{owner:text('owner').primaryKey(),version:integer('version').notNull(),payload:text('payload').notNull()});
export const acceptanceSessions=sqliteTable('acceptance_sessions',{token:text('token').primaryKey(),owner:text('owner').notNull(),actor:text('actor').notNull(),csrf:text('csrf').notNull(),expires:integer('expires').notNull()});
