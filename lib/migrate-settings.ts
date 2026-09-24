interface Storage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<unknown>;
}

// Preserve settings from releases made under the former project name.
// Keep legacy keys for rollback; never overwrite an existing new setting.
export async function migrateSettings(storage: Storage) {
  const suffixes = ['style', 'font-size', 'preferences', 'local-font-families', 'ui-language'];
  const keys = suffixes.flatMap(key => [`dul-subtitle:${key}`, `dual-subtitle:${key}`]);
  const saved = await storage.get(keys);
  const migrated: Record<string, unknown> = {};
  for (const suffix of suffixes) {
    const oldKey = `dul-subtitle:${suffix}`;
    const newKey = `dual-subtitle:${suffix}`;
    if (saved[newKey] === undefined && saved[oldKey] !== undefined) migrated[newKey] = saved[oldKey];
  }
  if (Object.keys(migrated).length) await storage.set(migrated);
}
