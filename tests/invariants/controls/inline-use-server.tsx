// Control (FR-07): an inline server action, which discover() cannot see.
import { db } from '@/core/db';

export default function Form() {
  async function wipe() {
    'use server';
    await db.project.deleteMany();
  }
  return <form action={wipe}><button>Wipe</button></form>;
}
