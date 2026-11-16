import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, transition, validate } from './workflow.mjs';
const receipt = [{ name: 'sample.pdf', size: 1, data: 'data:application/pdf;base64,AA==' }];
test('社員の申請を社長が承認すると、経理へ回る。経理は承認できない', () => {
  const r = seed()[0];
  assert.throws(() => transition(r, 'approve', 'accountant'));
  const approved = transition(r, 'approve', 'president');
  assert.equal(approved.status, 'accounting');
  assert.equal(r.status, 'submitted');
  assert.equal(transition(approved, 'complete', 'accountant').status, 'done');
  assert.throws(() => transition(r, 'complete', 'accountant'));
});
test('備品の購入前承認は、精算待ちに進めない', () => {
  const r = { ...seed()[1], status: 'submitted', approvedAmount: undefined };
  const approved = transition(r, 'approve', 'president');
  assert.equal(approved.status, 'purchase_authorized');
  assert.throws(() => transition(approved, 'complete', 'accountant'));
  assert.throws(() => transition(approved, 'actual', 'employee', { amount: 30000 }));
  assert.equal(transition(approved, 'actual', 'employee', { amount: 30000, attachments: receipt }).status, 'accounting');
});
test('備品の増額実績は社長の再承認が必要', () => {
  const r = transition(seed()[1], 'actual', 'employee', { amount: 40000, attachments: receipt });
  assert.equal(r.status, 'submitted');
  assert.throws(() => transition(r, 'complete', 'accountant'));
  const approved = transition(r, 'approve', 'president');
  assert.equal(approved.status, 'accounting');
  assert.equal(approved.approvedAmount, 40000);
  assert.equal(approved.requestedAmount, 32800);
});
test('経理差し戻しの修正は社長へ戻り、変更履歴を残す', () => {
  assert.throws(() => transition(seed()[2], 'return', 'accountant', { reason: ' ' }));
  const returned = transition(seed()[2], 'return', 'accountant', { reason: '用途を追記してください' });
  const edited = transition(returned, 'resubmit', 'employee', { purpose: '用紙の購入・社内会議用', amount: 3000, attachments: receipt });
  assert.equal(edited.status, 'submitted');
  assert.equal(edited.amount, 3000);
  assert.match(edited.history.at(-2).message, /用途を追記/);
  assert.throws(() => transition(edited, 'complete', 'accountant'));
});
test('却下・完了後の操作と、不正な金額・領収書不足を拒否する', () => {
  const r = seed()[0];
  assert.throws(() => transition(r, 'reject', 'president'));
  const rejected = transition(r, 'reject', 'president', { reason: '業務対象外' });
  assert.throws(() => transition(rejected, 'approve', 'president'));
  for (const amount of [0, -1, 1.5, NaN, Infinity, 100000000]) assert.throws(() => validate({ ...r, amount }));
  assert.throws(() => validate(r, true));
  assert.throws(() => transition({ ...r, status: 'done' }, 'complete', 'accountant'));
});
test('購入前の変更は領収書なしで再承認へ進み、再承認まで実績登録不可', () => {
  const r = transition(seed()[1], 'revise', 'employee', { title: '大型モニター', purpose: '製品変更のため再申請', amount: 45000 });
  assert.equal(r.status, 'submitted');
  assert.equal(r.actualRegistered, false);
  assert.throws(() => transition(r, 'actual', 'employee', { amount: 45000, attachments: receipt }));
  const approved = transition(r, 'approve', 'president');
  assert.equal(approved.status, 'purchase_authorized');
  assert.equal(approved.approvedAmount, 45000);
});
test('購入前の中止は理由必須で終端状態になる', () => {
  assert.throws(() => transition(seed()[1], 'cancel', 'employee'));
  const cancelled = transition(seed()[1], 'cancel', 'employee', { reason: '購入不要になったため' });
  assert.equal(cancelled.status, 'cancelled');
  assert.throws(() => transition(cancelled, 'actual', 'employee', { amount: 32000, attachments: receipt }));
  assert.throws(() => transition({ ...seed()[1], status: 'submitted', actualRegistered: true }, 'cancel', 'employee', { reason: '中止' }));
});
test('変更前後と承認時点の金額・用途・添付名を履歴で比較できる', () => {
  const original = seed()[1];
  const changed = transition(original, 'revise', 'employee', { purpose: '変更後の用途', amount: 45000, attachments: receipt });
  const h = changed.history.at(-1);
  assert.equal(h.before.amount, 32800);
  assert.equal(h.before.purpose, original.purpose);
  assert.equal(h.snapshot.amount, 45000);
  assert.equal(h.snapshot.purpose, '変更後の用途');
  assert.deepEqual(h.snapshot.attachments, ['sample.pdf']);
  const approved = transition(changed, 'approve', 'president');
  assert.equal(approved.history.at(-1).snapshot.amount, 45000);
  assert.equal(approved.history.at(-1).snapshot.approvedAmount, 45000);
  assert.equal(original.amount, 32800);
});
