import test from 'node:test';
import assert from 'node:assert/strict';

import { migrate, isPublicCode, normalizeCode, LEGACY_PUBLIC_SYNC_CODE } from '../js/store.js';
import { SAMPLE } from './fixtures/sample-state.mjs';

test('新裝置預設不同步、沒有同步碼', () => {
  const st = migrate({});
  assert.equal(st.settings.syncEnabled, false);
  assert.equal(st.settings.syncCode, '');
  assert.equal(st.settings.legacyPublicRoom, false);
});

test('舊裝置用公開同步碼：自動停止同步並標記需要搬家', () => {
  for (const code of ['BILLS-DEFAULT-2026', 'BILLSDEFAULT2026', 'bills-default-2026']) {
    const st = migrate({ ...SAMPLE, settings: { syncEnabled: true, syncCode: code, lastSyncAt: '2026-11-01T00:00:00Z' } });
    assert.equal(st.settings.syncEnabled, false, code);
    assert.equal(st.settings.syncCode, '', code);
    assert.equal(st.settings.legacyPublicRoom, true, code);
  }
});

test('舊裝置的帳務資料在遷移後完整保留', () => {
  const st = migrate({ ...SAMPLE, settings: { syncEnabled: true, syncCode: LEGACY_PUBLIC_SYNC_CODE } });
  assert.deepEqual(Object.keys(st.months).sort(), ['2026-09', '2026-10']);
  assert.equal(st.cards.length, 2);
  assert.equal(st.templates.length, 4);
});

test('私人同步碼維持原樣、照常同步', () => {
  const st = migrate({ settings: { syncEnabled: true, syncCode: 'ABCD-EFGH-JKLM' } });
  assert.equal(st.settings.syncEnabled, true);
  assert.equal(st.settings.syncCode, 'ABCD-EFGH-JKLM');
  assert.equal(st.settings.legacyPublicRoom, false);
});

test('公開碼判斷不受大小寫與分隔符號影響', () => {
  assert.equal(isPublicCode(' bills default 2026 '), true);
  assert.equal(isPublicCode('ABCD-EFGH-JKLM'), false);
  assert.equal(isPublicCode(''), false);
  assert.equal(normalizeCode('ab-cd 12'), 'ABCD12');
});
