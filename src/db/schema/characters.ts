import { relations } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const characters = sqliteTable("characters", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  age: int().notNull(),
  image: text(),
});

export const characterRelations = relations(characters, ({ many }) => ({
  attributes: many(attributes),
}));

export const attributes = sqliteTable("attributes", {
  id: int().primaryKey({ autoIncrement: true }),
  label: text(),
  value: int(),
  characterId: int("character_id").references(() => characters.id, {
    onDelete: "cascade",
  }),
});

export const attributeRelationships = relations(attributes, ({ one }) => ({
  attributes: one(characters, {
    fields: [attributes.characterId],
    references: [characters.id],
  }),
}));
