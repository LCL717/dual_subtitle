import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSettings } from '../lib/migrate-settings.ts';

test('rename migration preserves old preferences without replacing new settings', async () => {
  const data = { 'dul-subtitle:preferences': { enabled: true }, 'dul-subtitle:style': { fontSize: 24 },
    'dual-subtitle:style': { fontSize: 30 }, 'dul-subtitle:ui-language': 'en' };
  let writes = 0;
  const storage = { get: async () => ({ ...data }), set: async values => { writes++; Object.assign(data, values); } };
  await migrateSettings(storage);
  assert.deepEqual(data['dual-subtitle:preferences'], { enabled: true });
  assert.deepEqual(data['dual-subtitle:style'], { fontSize: 30 });
  assert.equal(data['dual-subtitle:ui-language'], 'en');
  assert.deepEqual(data['dul-subtitle:preferences'], { enabled: true });
  await migrateSettings(storage);
  assert.equal(writes, 1);
});
