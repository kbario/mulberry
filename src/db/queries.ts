import { db } from './db';

export const QUERIES = {
  getUsers() {
    return db.query.characters.findMany();
  },
};
