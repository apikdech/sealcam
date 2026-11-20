import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { keyText } from '../../test-support/worker-fixtures';
import { importMasterKey } from '../lib/zrec/keys';
import { Keys, openKeystore } from './keystore';

const base = () => importMasterKey(new Uint8Array(32).fill(7));

describe('IndexedDB keystore', () => {
  it('persists a non-extractable HKDF base key across reopen', async () => {
    const idb = new IDBFactory();
    const ks = await openKeystore(idb);
    await ks.put('a1b2c3d4e5f60718', await base());
    ks.close();

    const again = await openKeystore(idb);
    const all = await again.all();
    expect(all.map(([id]) => id)).toEqual(['a1b2c3d4e5f60718']);
    const key = all[0]![1];
    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe('HKDF');
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('deletes one key and leaves the rest', async () => {
    const ks = await openKeystore(new IDBFactory());
    await ks.put('aa', await base());
    await ks.put('bb', await base());
    await ks.delete('aa');
    expect((await ks.all()).map(([id]) => id)).toEqual(['bb']);
  });

  it('stores nothing but the key and its id', async () => {
    const idb = new IDBFactory();
    const ks = await openKeystore(idb);
    await ks.put('aa', await base());
    const raw = await new Promise<unknown[]>((resolve, reject) => {
      const open = idb.open('zview-keys');
      open.onsuccess = () => {
        const db = open.result;
        const req = db.transaction('keys').objectStore('keys').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      };
    });
    expect(Object.keys(raw[0] as object).sort()).toEqual(['base', 'keyId']);
  });
});

describe('Keys.remember', () => {
  const text = () => keyText('07'.repeat(32));

  it('remember stores the base key and list reports remembered', async () => {
    const keys = new Keys(new IDBFactory());
    const { keyId } = (await keys.import(await text(), false)) as { keyId: string };
    expect(await keys.list()).toEqual({ keys: [{ keyId, remembered: false }] });
    await keys.remember(keyId);
    expect(await keys.list()).toEqual({ keys: [{ keyId, remembered: true }] });
  });

  it('remember of an unknown key rejects with ErrNoKey', async () => {
    const keys = new Keys(new IDBFactory());
    await expect(keys.remember('deadbeef')).rejects.toMatchObject({ name: 'ErrNoKey' });
  });

  it('after remember and lock, the key reloads', async () => {
    const keys = new Keys(new IDBFactory());
    const { keyId } = (await keys.import(await text(), false)) as { keyId: string };
    await keys.remember(keyId);
    keys.lock();
    expect(await keys.tokens()).toHaveLength(1);
    expect([...(await keys.keyring()).keys()]).toEqual([keyId]);
  });
});
