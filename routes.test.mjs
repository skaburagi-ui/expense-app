import test from 'node:test';
import assert from 'node:assert/strict';
import { initialSettings, configure, assignedRoute, validateRoute, directSteps, purchaseSteps, currentStep, migrateLegacy } from './routes.mjs';
import { createRequest, applyAction, seed, settlementAmounts, transition } from './workflow.mjs';
import { openStore, storageKey, legacyKey } from './storage.mjs';
const receipt = [{ name: 'fictional.pdf', kind: 'receipt', size: 1, data: 'data:application/pdf;base64,AA==' }];
const quote = receipt.map(a => ({ ...a, kind: 'quote' }));
const values = (type = 'purchase', extra = {}) => ({ type, title: '架空のモニター', purpose: '架空の会議室用', date: '2026-11-18', amount: 10000, attachments: type === 'expense' || type === 'travel' ? receipt : [], ...extra });
let seq = 1;
const create = (type = 'purchase', extra = {}, settings = initialSettings(), records = []) => createRequest(values(type, extra), settings, 'employee', records, `TEST-${seq++}`);
function act(records, id, action, role, extra = {}) { const r = records.find(r => r.id === id); return applyAction(records, id, action, role, { expectedRevision: r.revision, stepId: currentStep(r)?.id, ...extra }); }
const payment = (amount, method = 'transfer') => ({ settlement: { date: '2026-11-18', method, amount, operator: '架空経理' } });
const conf = (s, action, extra) => configure(s, action, 'maintainer', { expectedRevision: s.revision, ...extra });
function memory(entries = {}) { const data = new Map(Object.entries(entries)); return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; }

test('保守担当だけが下書き作成・編集・公開・公開版割当・停止できる', () => {
  const s = initialSettings();
  for (const role of ['employee', 'president', 'accountant']) for (const action of ['save', 'publish', 'assign', 'stop']) assert.throws(() => configure(s, action, role, { expectedRevision: 0, id: 'direct' }));
  let next = conf(s, 'save', { id: 'custom', name: '架空の直接ルート', draft: { types: ['advance'], steps: directSteps() } });
  assert.equal(next.patterns.at(-1).versions.length, 0);
  assert.throws(() => conf(next, 'assign', { id: 'custom', version: 1, type: 'advance' }));
  next = conf(next, 'publish', { id: 'custom' });
  next = conf(next, 'assign', { id: 'custom', version: 1, type: 'advance' });
  assert.equal(create('advance', {}, next).route.patternId, 'custom');
  next = conf(next, 'stop', { id: 'custom' });
  assert.throws(() => create('advance', {}, next));
  assert.equal(s.patterns.length, 2);
  assert.throws(() => configure(next, 'publish', 'maintainer', { id: 'custom', expectedRevision: 0 }));
});
test('公開検証は空・承認なし・承認前支払・実績不足・重複ID・担当不整合を拒否する', () => {
  for (const steps of [[], directSteps().filter(s => s.kind !== 'approve'), directSteps().reverse(), directSteps().map(s => ({ ...s, role: 'employee' })), directSteps().map(s => ({ ...s, id: 'same' }))]) assert.throws(() => validateRoute({ types: ['advance'], steps }));
  for (const steps of [directSteps(), purchaseSteps().filter(s => s.kind !== 'actual'), [purchaseSteps()[2], ...directSteps()], [...purchaseSteps(), purchaseSteps()[3]]]) assert.throws(() => validateRoute({ types: ['purchase'], steps }));
  assert.throws(() => validateRoute({ types: ['purchase', 'advance'], steps: purchaseSteps() }));
  assert.throws(() => create('advance', {}, { ...initialSettings(), assignments: {} }));
  assert.throws(() => createRequest(values('advance'), initialSettings(), 'maintainer'));
});
test('仮払いは領収書なしで社長承認→経理支給、支給済みは実費精算完了と別', () => {
  let rs = [create('advance')], id = rs[0].id;
  assert.throws(() => act(rs, id, 'complete', 'accountant', payment(10000)));
  rs = act(rs, id, 'approve', 'president');
  assert.equal(currentStep(rs[0]).kind, 'settle');
  assert.throws(() => act(rs, id, 'complete', 'accountant'));
  rs = act(rs, id, 'complete', 'accountant', payment(10000));
  assert.equal(rs[0].status, 'disbursed'); assert.equal(rs[0].settlement.kind, 'advance'); assert.equal(rs[0].settledBy, undefined);
  assert.throws(() => act(rs, id, 'complete', 'accountant', payment(10000)));
});
test('購入は事前経理→社長→本人実績→最後の経理を別工程IDで実行', () => {
  let rs = [create()], id = rs[0].id;
  const first = currentStep(rs[0]).id;
  assert.throws(() => act(rs, id, 'approve', 'president'));
  assert.throws(() => act(rs, id, 'complete', 'accountant', payment(10000)));
  rs = act(rs, id, 'review', 'accountant'); rs = act(rs, id, 'approve', 'president');
  assert.throws(() => act(rs, id, 'actual', 'employee', { attachments: quote }));
  rs = act(rs, id, 'actual', 'employee', { attachments: receipt });
  assert.notEqual(currentStep(rs[0]).id, first);
  assert.throws(() => act(rs, id, 'review', 'accountant', { stepId: first }));
  rs = act(rs, id, 'complete', 'accountant', payment(10000));
  assert.equal(rs[0].status, 'done'); assert.equal(rs[0].history.filter(h => h.stepId === first).length, 1);
});
test('ルート新版本・割当変更・停止は提出済み申請に遡及しない', () => {
  let s = initialSettings(); let rs = [create('advance', {}, s)], id = rs[0].id;
  const frozen = structuredClone(rs[0].route);
  const steps = [{ id: 'check2', name: '追加確認', kind: 'review', role: 'accountant' }, ...directSteps()];
  s = conf(s, 'save', { id: 'direct', name: '変更版', draft: { types: ['advance'], steps } });
  s = conf(s, 'publish', { id: 'direct' }); s = conf(s, 'assign', { id: 'direct', version: 2, type: 'advance' });
  assert.equal(create('advance', {}, s).route.steps[0].id, 'check2');
  s = conf(s, 'stop', { id: 'direct' });
  assert.deepEqual(rs[0].route, frozen);
  rs = act(rs, id, 'approve', 'president'); rs = act(rs, id, 'complete', 'accountant', payment(10000));
  assert.equal(rs[0].status, 'disbursed');
});
test('工程の飛越・担当外・自己承認・重複revision・終端操作を拒否', () => {
  let rs = [create()], id = rs[0].id, stale = rs[0];
  assert.throws(() => act(rs, id, 'review', 'employee'));
  assert.throws(() => act(rs, id, 'review', 'accountant', { stepId: 'payment' }));
  rs = act(rs, id, 'review', 'accountant');
  assert.throws(() => transition(rs[0], 'approve', 'president', { expectedRevision: stale.revision, stepId: 'approval' }));
  assert.throws(() => transition({ ...rs[0], applicant: 'president' }, 'approve', 'president', { expectedRevision: rs[0].revision, stepId: 'approval' }));
  rs = act(rs, id, 'reject', 'president', { reason: '架空の却下' });
  assert.throws(() => act(rs, id, 'approve', 'president'));
});
test('理由必須の差し戻しと購入前変更は保存済みルート先頭からやり直す', () => {
  let rs = [create()], id = rs[0].id;
  assert.throws(() => act(rs, id, 'return', 'accountant', { reason: ' ' }));
  rs = act(rs, id, 'review', 'accountant'); rs = act(rs, id, 'approve', 'president');
  rs = act(rs, id, 'revise', 'employee', { amount: 11000 });
  assert.equal(currentStep(rs[0]).id, 'precheck'); assert.equal(rs[0].actualRegistered, false);
  assert.throws(() => act(rs, id, 'actual', 'employee', { attachments: receipt }));
  rs = act(rs, id, 'return', 'accountant', { reason: '架空用途を追記' });
  rs = act(rs, id, 'resubmit', 'employee', { purpose: '架空の変更用途' });
  assert.equal(currentStep(rs[0]).id, 'precheck');
  assert.equal(rs[0].history.at(-1).before.purpose, '架空の会議室用');
  rs = act(rs, id, 'cancel', 'employee', { reason: '架空の中止' });
  assert.throws(() => act(rs, id, 'resubmit', 'employee'));
});
test('購入後の増額・品目用途変更は再確認・再承認し、実績と承認時の添付本体を保持', () => {
  for (const changes of [{ amount: 12000 }, { title: '架空の別品目' }, { purpose: '架空の別用途' }]) {
    let rs = [create()], id = rs[0].id;
    rs = act(rs, id, 'review', 'accountant'); rs = act(rs, id, 'approve', 'president');
    const approval = structuredClone(rs[0].history.at(-1));
    rs = act(rs, id, 'actual', 'employee', { ...changes, attachments: receipt });
    assert.equal(currentStep(rs[0]).id, 'precheck'); assert.equal(rs[0].actualRegistered, true);
    assert.throws(() => act(rs, id, 'actual', 'employee', { attachments: receipt }));
    rs = act(rs, id, 'review', 'accountant'); rs = act(rs, id, 'approve', 'president');
    assert.equal(currentStep(rs[0]).kind, 'settle');
    assert.deepEqual(rs[0].purchaseActual.attachmentFiles, receipt);
    assert.deepEqual(rs[0].history[2], approval);
    rs = act(rs, id, 'return', 'accountant', { reason: '架空の明細追記' });
    rs = act(rs, id, 'resubmit', 'employee', { purpose: '架空の追記' });
    assert.equal(rs[0].actualRegistered, true);
    rs = act(rs, id, 'review', 'accountant'); rs = act(rs, id, 'approve', 'president');
    assert.equal(currentStep(rs[0]).kind, 'settle');
    rs = act(rs, id, 'complete', 'accountant', payment(rs[0].amount)); assert.equal(rs[0].status, 'done');
  }
});
test('仮払い紐付けの追加支給・返金・差額ゼロ、重複紐付けと二重精算を検証', () => {
  for (const actual of [12000, 8000, 10000]) {
    let rs = [create('advance')], advanceId = rs[0].id;
    assert.throws(() => create('expense', { advanceId }, initialSettings(), rs));
    rs = act(rs, advanceId, 'approve', 'president'); rs = act(rs, advanceId, 'complete', 'accountant', payment(10000));
    const expense = create('expense', { advanceId, amount: actual }, initialSettings(), rs), id = expense.id; rs.push(expense);
    assert.deepEqual(settlementAmounts(expense, rs), { paid: 10000, actual, difference: actual - 10000 });
    assert.throws(() => create('expense', { advanceId }, initialSettings(), rs));
    rs = act(rs, id, 'approve', 'president');
    assert.throws(() => act(rs, id, 'complete', 'accountant', payment(999)));
    rs = act(rs, id, 'complete', 'accountant', payment(Math.abs(actual - 10000), actual < 10000 ? 'refund' : 'transfer'));
    assert.equal(rs.find(r => r.id === advanceId).settledBy, id);
    assert.equal(rs.find(r => r.id === id).settlement.difference, actual - 10000);
    assert.throws(() => create('expense', { advanceId }, initialSettings(), rs));
    assert.throws(() => act(rs, id, 'complete', 'accountant', payment(2000)));
  }
});
test('旧データの元バイト・履歴・添付を保全し事前経理を追加しない', () => {
  const old = seed(); old[1].attachments = receipt; const raw = JSON.stringify(old);
  const storage = memory({ [legacyKey]: raw }); const store = openStore(storage);
  assert.equal(storage.getItem(legacyKey), raw);
  assert.deepEqual(store.state.records[1].history, old[1].history);
  assert.deepEqual(store.state.records[1].attachments, receipt);
  assert.equal(store.state.records[0].route.steps[0].kind, 'approve');
  assert.equal(currentStep(store.state.records[1]).kind, 'actual');
  assert.equal(currentStep(store.state.records[2]).kind, 'settle');
  assert.deepEqual(openStore(storage).state, store.state);
  assert.throws(() => migrateLegacy([...old, old[0]]));
});
test('旧データの欠損・不正JSON・不正形式は停止し、v1を書換えずv2も作らない', () => {
  for (const raw of ['{broken', 'null', '{}', JSON.stringify([{ id: 'broken' }]), JSON.stringify(seed().map(r => ({ ...r, attachments: null }))), JSON.stringify(seed().map(r => ({ ...r, amount: -1 })))]) {
    const storage = memory({ [legacyKey]: raw }); assert.throws(() => openStore(storage));
    assert.equal(storage.getItem(legacyKey), raw); assert.equal(storage.getItem(storageKey), null);
  }
  const empty = memory({ [legacyKey]: '[]' }); assert.equal(openStore(empty).state.records.length, 0);
});
test('新形式の欠損と保存容量不足を明示し、メモリ状態を成功扱いで更新しない', () => {
  const storage = memory(); const store = openStore(storage); const before = structuredClone(store.state);
  storage.setItem = () => { throw Error('QuotaExceededError'); };
  assert.throws(() => store.save({ ...store.state, records: [] }), /保存できません/);
  assert.deepEqual(store.state, before);
  const full = memory({ [legacyKey]: JSON.stringify(seed()) }); full.setItem = () => { throw Error('quota'); }; assert.throws(() => openStore(full), /旧データは変更していません/);
  for (const bad of ['null', '{}', '{broken', JSON.stringify({ ...before, records: [{ id: 'bad' }] })]) assert.throws(() => openStore(memory({ [storageKey]: bad })));
});
test('別画面の同時更新は拒否し先行保存を保持する', () => {
  const storage = memory(); const a = openStore(storage), b = openStore(storage);
  a.save({ ...a.state, records: [] });
  assert.throws(() => b.save(b.state), /別画面/); assert.equal(openStore(storage).state.records.length, 0);
});
test('新規の金額・領収書・設定なしの入力を拒否する', () => {
  for (const amount of [0, -1, 1.5, NaN, Infinity, 100000000]) assert.throws(() => create('advance', { amount }));
  assert.throws(() => create('expense', { attachments: quote }));
  assert.throws(() => create('expense', { attachments: [] }));
  assert.throws(() => create('advance', { purpose: '' }));
});

test('日付・添付の型容量・解除した割当・不整合な旧実績を拒否する', () => {
  for (const date of ['2026-02-30', 'bad', '2026-13-01']) assert.throws(() => create('advance', { date }));
  for (const attachments of [[{ ...receipt[0], size: 4 * 1024 * 1024 }], [{ ...receipt[0], data: 'data:text/html;base64,AA==' }], [{ ...receipt[0], kind: 'unknown' }]]) assert.throws(() => create('expense', { attachments }));
  const s = conf(initialSettings(), 'unassign', { type: 'advance' }); assert.throws(() => create('advance', {}, s));
  const old = seed(); old[1].status = 'accounting'; old[1].actualRegistered = false;
  assert.throws(() => migrateLegacy(old));
});
test('完了した差額精算は保存・再読込しても元仮払いと処理区分を保つ', () => {
  const storage = memory(), store = openStore(storage); let rs = [create('advance')], advanceId = rs[0].id;
  rs = act(rs, advanceId, 'approve', 'president'); rs = act(rs, advanceId, 'complete', 'accountant', payment(10000));
  const e = create('expense', { advanceId, amount: 12000 }, initialSettings(), rs); rs.push(e);
  rs = act(rs, e.id, 'approve', 'president'); rs = act(rs, e.id, 'complete', 'accountant', payment(2000));
  store.save({ ...store.state, records: rs });
  const reloaded = openStore(storage).state.records;
  assert.equal(reloaded.find(r => r.id === e.id).history.at(-1).settlement.kind, 'additional');
  assert.equal(reloaded[0].settledBy, e.id);
});
test('移行した旧購入申請も差戻し・増額再承認後は社長直接の元ルートを維持する', () => {
  let rs = migrateLegacy(seed()), id = 'EX-1002';
  rs = act(rs, id, 'actual', 'employee', { amount: 40000, attachments: receipt });
  assert.equal(currentStep(rs.find(r => r.id === id)).kind, 'approve');
  rs = act(rs, id, 'approve', 'president');
  assert.equal(currentStep(rs.find(r => r.id === id)).kind, 'settle');
  rs = act(rs, id, 'return', 'accountant', { reason: '架空の用途追記' });
  rs = act(rs, id, 'resubmit', 'employee', { purpose: '架空の変更後用途' });
  assert.equal(currentStep(rs.find(r => r.id === id)).role, 'president');
  assert.equal(rs.find(r => r.id === id).actualRegistered, true);
  rs = act(rs, id, 'approve', 'president'); rs = act(rs, id, 'complete', 'accountant', payment(40000));
  assert.equal(rs.find(r => r.id === id).status, 'done');
});
test('仮払い支給・通常精算に不適切な返金方法を混ぜず、会社直接購入は通常精算で記録', () => {
  for (const type of ['advance', 'expense']) {
    let rs = [create(type)], id = rs[0].id; rs = act(rs, id, 'approve', 'president');
    assert.throws(() => act(rs, id, 'complete', 'accountant', payment(10000, 'refund')));
    if (type === 'advance') assert.throws(() => act(rs, id, 'complete', 'accountant', payment(10000, 'company')));
    else { rs = act(rs, id, 'complete', 'accountant', payment(10000, 'company')); assert.equal(rs[0].settlement.method, 'company'); }
  }
});
// F-01: corrupted approval/progress records stay in memory-only fixtures; never edit browser storage.
const invalidApprovals = [undefined, null, NaN, Infinity, -Infinity, '20000', 0, -1, 1.5, 100000000];
function purchaseAtActual() {
  let rs = [create('purchase', { amount: 20000 })], id = rs[0].id;
  rs = act(rs, id, 'review', 'accountant'); rs = act(rs, id, 'approve', 'president');
  return rs[0];
}
function stateWith(r) { return { schema: 2, revision: 0, settings: initialSettings(), records: [r] }; }
function assertLoadRejectedWithoutWrite(state) {
  const raw = JSON.stringify(state), storage = memory({ [storageKey]: raw }), before = structuredClone(state);
  let writes = 0; storage.setItem = () => { writes++; };
  assert.throws(() => openStore(storage));
  assert.equal(writes, 0); assert.equal(storage.getItem(storageKey), raw); assert.deepEqual(state, before);
}
test('F-01再現A: 旧購入許可・精算済み工程の承認額欠損／非数／範囲外はv1保全・v2未書込で停止', () => {
  for (const status of ['purchase_authorized', 'accounting', 'done']) for (const approvedAmount of invalidApprovals) {
    const old = seed(), p = old[1]; p.status = status; p.actualRegistered = status !== 'purchase_authorized'; p.approvedAmount = approvedAmount;
    const before = structuredClone(old), raw = JSON.stringify(old), storage = memory({ [legacyKey]: raw }); let writes = 0;
    storage.setItem = () => { writes++; };
    assert.throws(() => migrateLegacy(old), /承認額/);
    assert.throws(() => openStore(storage), /承認額/);
    assert.equal(writes, 0); assert.equal(storage.getItem(legacyKey), raw); assert.equal(storage.getItem(storageKey), null);
    assert.deepEqual(old, before);
  }
  const old = seed(); delete old[2].approvedAmount;
  assert.throws(() => openStore(memory({ [legacyKey]: JSON.stringify(old) })), /承認額/);
});
test('F-01再現B: v2購入実績・精算工程の不正承認額を読込み時点で拒否し保存原文を維持', () => {
  const actual = purchaseAtActual();
  const accounting = act([actual], actual.id, 'actual', 'employee', { amount: 19000, attachments: receipt })[0];
  const done = act([accounting], actual.id, 'complete', 'accountant', payment(19000))[0];
  const payments = ['advance', 'expense'].map(type => { const r = create(type); return act([r], r.id, 'approve', 'president')[0]; });
  for (const record of [actual, accounting, done, ...payments]) for (const approvedAmount of invalidApprovals) assertLoadRejectedWithoutWrite(stateWith({ ...record, approvedAmount }));
});
test('F-01: 読込みを経由しないactual・completeも不正承認額を拒否し元オブジェクトを変更しない', () => {
  const actual = purchaseAtActual(), accounting = act([actual], actual.id, 'actual', 'employee', { attachments: receipt })[0];
  for (const [record, action, role, payload] of [[actual, 'actual', 'employee', { amount: 99999, attachments: receipt }], [accounting, 'complete', 'accountant', payment(20000)]]) {
    for (const approvedAmount of invalidApprovals) {
      const bad = { ...record, approvedAmount }, before = structuredClone(bad), rs = [bad];
      assert.throws(() => act(rs, bad.id, action, role, payload), /承認額/);
      assert.deepEqual(rs, [before]);
    }
  }
  for (const record of [seed()[1], seed()[2]]) for (const approvedAmount of invalidApprovals) {
    const bad = { ...record, approvedAmount }, before = structuredClone(bad);
    assert.throws(() => transition(bad, record.type === 'purchase' ? 'actual' : 'complete', record.type === 'purchase' ? 'employee' : 'accountant', { amount: 99999, attachments: receipt }), /承認額/);
    assert.deepEqual(bad, before);
  }
});
test('F-01: v2実績フラグ・ルート識別の欠損／型不正を読込みと遷移で拒否', () => {
  const actual = purchaseAtActual();
  const corruptions = [
    r => delete r.actualRegistered, r => r.actualRegistered = null, r => r.actualRegistered = 'false',
    r => delete r.route.version, r => r.route.version = 0, r => r.route.version = '1', r => r.route.version = 1.5,
    r => delete r.route.patternId, r => r.route.patternId = '', r => r.route.patternId = 1,
    r => delete r.route.name, r => delete r.contentVersion, r => r.contentVersion = 0, r => r.revision = -1,
    r => delete r.requestedAmount
  ];
  for (const corrupt of corruptions) {
    const bad = structuredClone(actual); corrupt(bad); const before = structuredClone(bad);
    assertLoadRejectedWithoutWrite(stateWith(bad));
    assert.throws(() => act([bad], bad.id, 'actual', 'employee', { amount: 99999, attachments: receipt }));
    assert.deepEqual(bad, before);
  }
});
test('F-01: 状態と工程・実績の矛盾、承認上限を超えた精算を拒否する', () => {
  const actual = purchaseAtActual(), accounting = act([actual], actual.id, 'actual', 'employee', { amount: 19000, attachments: receipt })[0];
  const broken = [
    { ...actual, actualRegistered: true }, { ...actual, stepIndex: actual.stepIndex + 1 },
    { ...actual, status: 'done' }, { ...actual, status: 'returned' },
    { ...accounting, actualRegistered: false }, { ...accounting, amount: 99999 },
    { ...accounting, status: 'returned', actualRegistered: false },
    { ...accounting, status: 'cancelled' }, { ...accounting, status: 'rejected' },
    { ...accounting, approvedVersion: accounting.contentVersion + 1 }
  ];
  for (const bad of broken) { assertLoadRejectedWithoutWrite(stateWith(bad)); assert.throws(() => act([bad], bad.id, 'complete', 'accountant', payment(bad.amount))); }
  const expense = create('expense'); expense.actualRegistered = true; assertLoadRejectedWithoutWrite(stateWith(expense));
});
test('F-01: 不正な候補のsaveは既存v2原文とstore.stateを変更しない', () => {
  const actual = purchaseAtActual(), storage = memory({ [storageKey]: JSON.stringify(stateWith(actual)) }), store = openStore(storage);
  const raw = storage.getItem(storageKey), before = structuredClone(store.state), next = structuredClone(store.state);
  delete next.records[0].approvedAmount;
  assert.throws(() => store.save(next), /承認額/);
  assert.equal(storage.getItem(storageKey), raw); assert.deepEqual(store.state, before);
});
test('F-01正常互換: 承認額以下・同額・増額実績と購入済み再申請を保存／再読込みして処理できる', () => {
  for (const amount of [19000, 20000, 25000]) {
    let r = purchaseAtActual(); const id = r.id, storage = memory({ [storageKey]: JSON.stringify(stateWith(r)) }); let store = openStore(storage);
    const saveAction = (action, role, payload = {}) => {
      store.save({ ...store.state, records: act(store.state.records, id, action, role, payload) });
      store = openStore(storage); r = store.state.records[0];
    };
    saveAction('actual', 'employee', { amount, attachments: receipt });
    assert.equal(r.actualRegistered, true);
    if (amount > 20000) { assert.equal(currentStep(r).id, 'precheck'); saveAction('review', 'accountant'); saveAction('approve', 'president'); }
    else { assert.equal(r.contentVersion, 2); assert.equal(r.approvedVersion, 1); }
    assert.equal(currentStep(r).kind, 'settle');
    const actualSnapshot = structuredClone(r.purchaseActual);
    saveAction('return', 'accountant', { reason: '架空の用途追記' });
    saveAction('resubmit', 'employee', { purpose: '架空の追記用途' });
    assert.equal(r.actualRegistered, true); assert.deepEqual(r.purchaseActual, actualSnapshot);
    saveAction('review', 'accountant'); saveAction('approve', 'president');
    assert.equal(currentStep(r).kind, 'settle'); saveAction('complete', 'accountant', payment(amount)); assert.equal(r.status, 'done');
  }
  const raw = JSON.stringify(seed()), storage = memory({ [legacyKey]: raw }), store = openStore(storage);
  assert.equal(storage.getItem(legacyKey), raw);
  for (const r of store.state.records) { assert.equal(r.route.patternId, 'legacy'); assert.equal(r.route.version, 1); assert.equal(typeof r.actualRegistered, 'boolean'); }
  assert.equal(store.state.records[1].approvedVersion, undefined);
  const old = seed(); old[0].status = 'returned';
  assert.doesNotThrow(() => openStore(memory({ [legacyKey]: JSON.stringify(old) })));
});
