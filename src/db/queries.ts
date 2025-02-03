import { query } from '@solidjs/router';
import { db } from './db';

export const QUERIES = {
  Characters: {
    GetAll: query(async () => {
      'use server';
      return await db.query.characters.findMany();
    }, 'characters'),
  },
};
