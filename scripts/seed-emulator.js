#!/usr/bin/env node
// Simple seeder that writes documents to Firestore Emulator via REST API.
// Usage: FIREBASE_PROJECT_ID=your-project-id node scripts/seed-emulator.js

const fetch = globalThis.fetch || (await import('node-fetch')).default;
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error('Set FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID env var');
  process.exit(1);
}

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
const baseUrl = `http://${EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents`;

function toValue(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  switch (typeof value) {
    case 'string': return { stringValue: value };
    case 'number': return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    case 'boolean': return { booleanValue: value };
    case 'object': {
      const fields = {};
      for (const k of Object.keys(value)) fields[k] = toValue(value[k]);
      return { mapValue: { fields } };
    }
    default: return { stringValue: String(value) };
  }
}

async function writeDoc(collection, id, doc) {
  const url = `${baseUrl}/${collection}?documentId=${encodeURIComponent(id)}`;
  const body = { fields: {} };
  for (const k of Object.keys(doc)) body.fields[k] = toValue(doc[k]);
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to write ${collection}/${id}: ${res.status} ${txt}`);
  }
  return res.json();
}

async function main() {
  console.log('Seeding emulator at', EMULATOR_HOST, 'project:', projectId);
  const seed = require('../seeds/initial-data.json');
  for (const [collection, docs] of Object.entries(seed)) {
    for (const d of docs) {
      const id = d.id || (Math.random().toString(36).slice(2, 9));
      const doc = { ...d }; delete doc.id;
      try {
        await writeDoc(collection, id, doc);
        console.log('Wrote', collection, id);
      } catch (err) {
        console.error(err.message);
      }
    }
  }
  console.log('Seeding finished');
}

main().catch((e) => { console.error(e); process.exit(1); });
