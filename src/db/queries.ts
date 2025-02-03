import { db } from './db';

export const QUERIES = {
  getUsers() {
    'use server';
    return db.query.characters.findMany();
  },
};
