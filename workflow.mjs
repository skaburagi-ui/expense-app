import { assignedRoute, currentStep, syncStatus, migrateLegacy, validateRequestProgress } from './routes.mjs';
export const labels = { submitted: '社長の承認待ち', returned: '差し戻し', purchase_authorized: '購入・実績登録待ち', accounting: '経理の処理待ち', done: '処理完了', rejected: '却下', cancelled: '購入中止', reviewing: '経理の事前確認待ち', disbursed: '仮払い支給済み（実費未精算）' };
export const roles = { employee: '社員', president: '社長', accountant: '経理', maintainer: '試用保守担当' };
export const snapshot = r => ({ title: r.title, purpose: r.purpose, date: r.date, amount: r.amount, approvedAmount: r.approvedAmount, status: r.status, attachments: r.attachments.map(a => a.name), attachmentFiles: structuredClone(r.attachments), actualRegistered: !!r.actualRegistered, contentVersion: r.contentVersion, route: structuredClone(r.route), stepIndex: r.stepIndex });
export function validate(values, receiptRequired = false) {
  if (typeof values.title !== 'string' || !values.title.trim() || values.title.length > 80 || typeof values.purpose !== 'string' || !values.purpose.trim() || values.purpose.length > 2000 || !validDate(values.date)) throw Error('件名・用途・日付を入力してください。');
  if (!Number.isSafeInteger(values.amount) || values.amount < 1 || values.amount > 99999999) throw Error('金額は1〜99,999,999円の整数で入力してください。');
  if (!Array.isArray(values.attachments) || values.attachments.some(a => !a || typeof a.name !== 'string' || !a.name || !Number.isSafeInteger(a.size) || a.size < 0 || typeof a.data !== 'string' || !/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(a.data) || a.kind && !['quote', 'receipt'].includes(a.kind)) || values.attachments.reduce((n, a) => n + a.size, 0) > 3 * 1024 * 1024) throw Error('添付の形式・容量が不正です。画像・PDF、合計3MB以内で指定してください。');
  if (receiptRequired && !values.attachments?.some(a => !a.kind || a.kind === 'receipt')) throw Error('領収書を添付してください。');
}
function legacyTransition(original, action, role, payload = {}) {
  // Validate raw legacy inputs through the same normalization used by migration, without changing them.
  migrateLegacy([original]);
  const r = structuredClone(original);
  const require = (allowedRole, statuses) => {
    if (role !== allowedRole || !statuses.includes(r.status)) throw Error('この状態では操作できません。');
  };
  let message;
  if (action === 'approve') {
    require('president', ['submitted']);
    r.approvedAmount = r.amount;
    r.status = r.type === 'purchase' && !r.actualRegistered ? 'purchase_authorized' : 'accounting';
    message = r.status === 'purchase_authorized' ? '購入前申請を承認' : '申請を承認・経理へ回付';
  } else if (action === 'return') {
    if (!((role === 'president' && r.status === 'submitted') || (role === 'accountant' && r.status === 'accounting'))) throw Error('差し戻しできません。');
    if (!payload.reason?.trim()) throw Error('差し戻し理由を入力してください。');
    r.status = 'returned'; message = `差し戻し：${payload.reason.trim()}`;
  } else if (action === 'reject') {
    require('president', ['submitted']);
    if (!payload.reason?.trim()) throw Error('却下理由を入力してください。');
    r.status = 'rejected'; message = `却下：${payload.reason.trim()}`;
  } else if (action === 'actual') {
    require('employee', ['purchase_authorized']);
    const values = { ...r, ...payload };
    validate(values, true);
    r.amount = values.amount; r.attachments = values.attachments;
    r.actualRegistered = true;
    r.status = r.amount > r.approvedAmount ? 'submitted' : 'accounting';
    message = r.status === 'submitted' ? '購入実績を登録・増額のため社長へ再申請' : '購入実績を登録・経理へ回付';
  } else if (action === 'resubmit' || action === 'revise') {
    require('employee', action === 'revise' ? ['purchase_authorized'] : ['returned']);
    if (action === 'revise' && (r.type !== 'purchase' || r.actualRegistered)) throw Error('購入前の備品申請のみ変更できます。');
    const values = { ...r, ...payload };
    validate(values, r.type !== 'purchase' || r.actualRegistered);
    for (const key of ['title', 'purpose', 'date', 'amount', 'attachments']) r[key] = values[key];
    r.status = 'submitted'; message = action === 'revise' ? '購入前の内容変更・社長へ再申請（再承認まで購入不可）' : '修正して社長へ再申請';
  } else if (action === 'cancel') {
    require('employee', ['submitted', 'returned', 'purchase_authorized']);
    if (r.type !== 'purchase' || r.actualRegistered) throw Error('購入前の備品申請のみ中止できます。');
    if (!payload.reason?.trim()) throw Error('購入中止の理由を入力してください。');
    r.status = 'cancelled'; message = `購入中止：${payload.reason.trim()}`;
  } else if (action === 'complete') {
    require('accountant', ['accounting']);
    r.status = 'done'; message = '経理が精算・処理の完了を記録';
  } else throw Error('不明な操作です。');
  r.history.push({ at: new Date().toISOString(), actor: roles[role], message, snapshot: snapshot(r), ...(['actual', 'resubmit', 'revise'].includes(action) ? { before: snapshot(original) } : {}) });
  return r;
}
export function seed() {
  const make = (id, type, title, amount, status, purpose) => ({ id, type, title, amount, requestedAmount: amount, date: '2026-11-16', purpose, status, attachments: [], actualRegistered: false, history: [{ at: '2026-11-16T00:00:00Z', actor: '社員', message: '社長へ申請（架空データ）' }] });
  const a = make('EX-1001', 'travel', '大阪出張の交通費', 28400, 'submitted', 'お客様との打ち合わせ。東京〜新大阪の往復交通費。');
  const b = make('EX-1002', 'purchase', '打ち合わせ用モニター', 32800, 'purchase_authorized', '会議室での資料共有に使用。27インチのモニターを1台購入予定。');
  b.approvedAmount = 32800; b.history.push({ at: '2026-11-16T01:00:00Z', actor: '社長', message: '購入前申請を承認（架空データ）' });
  const c = make('EX-1003', 'expense', '事務用品の立替精算', 2640, 'accounting', 'プリンター用紙とファイルを購入。');
  c.approvedAmount = 2640; c.history.push({ at: '2026-11-16T02:00:00Z', actor: '社長', message: '申請を承認・経理へ回付（架空データ）' });
  return [a, b, c];
}

export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const now = () => new Date().toISOString();
const contentKeys = ['title', 'purpose', 'date', 'amount', 'attachments'];
const terminal = ['done', 'disbursed', 'rejected', 'cancelled'];
export function createRequest(values, settings, role, records = [], id = `EX-${Date.now()}`) {
  if (role !== 'employee') throw Error('社員だけが申請できます。');
  validate(values, !['purchase', 'advance'].includes(values.type));
  const r = { ...Object.fromEntries(contentKeys.map(k => [k, structuredClone(values[k])])), type: values.type, id, applicant: 'sample-employee', requestedAmount: values.amount, actualRegistered: false, route: assignedRoute(settings, values.type), stepIndex: 0, revision: 0, contentVersion: 1, history: [], advanceId: values.advanceId || null };
  if (records.some(x => x.id === id)) throw Error('申請番号が重複しています。');
  checkAdvance(r, records);
  syncStatus(r);
  r.history.push({ at: now(), actor: roles.employee, message: '割当済みルートへ提出', snapshot: snapshot(r) });
  return r;
}
function checkAdvance(r, records) {
  if (!r.advanceId) return;
  const a = records.find(a => a.id === r.advanceId);
  if (!['expense', 'travel'].includes(r.type) || !a || a.type !== 'advance' || a.status !== 'disbursed' || a.settledBy || a.applicant !== r.applicant || records.some(x => x.id !== r.id && x.advanceId === a.id && !['rejected', 'cancelled'].includes(x.status))) throw Error('この仮払いは紐付けできません（未支給・精算済み・重複等）。');
}
export function settlementAmounts(r, records) {
  const a = r.advanceId ? records.find(a => a.id === r.advanceId) : null;
  const paid = a?.settlement?.amount || 0;
  return { paid, actual: r.amount, difference: r.amount - paid };
}
export function transition(original, action, role, payload = {}) {
  if (!original.route) return legacyTransition(original, action, role, payload);
  validateRequestProgress(original);
  const r = structuredClone(original);
  if (payload.expectedRevision !== r.revision) throw Error('申請が更新されています。開き直してください。');
  if (terminal.includes(r.status)) throw Error('終了した申請は操作できません。');
  const step = currentStep(r);
  const requireStep = (kind) => {
    if (!step || step.kind !== kind || step.role !== role || payload.stepId !== step.id) throw Error('現在工程・担当と操作が一致していません。');
    if (role === 'president' && r.applicant === 'president') throw Error('自己承認はできません。代替承認者が未設定です。');
  };
  const requireEmployee = () => { if (role !== 'employee' || r.applicant && r.applicant !== 'sample-employee') throw Error('申請者本人だけが操作できます。'); };
  const reason = () => { if (!payload.reason?.trim()) throw Error('理由を入力してください。'); return payload.reason.trim(); };
  const updateContent = (receiptRequired) => {
    const values = { ...r, ...Object.fromEntries(contentKeys.filter(k => k in payload).map(k => [k, payload[k]])) };
    validate(values, receiptRequired);
    for (const k of contentKeys) r[k] = structuredClone(values[k]);
    r.contentVersion++;
  };
  let message;
  if (action === 'approve' || action === 'review') {
    requireStep(action === 'approve' ? 'approve' : 'review');
    if (action === 'approve') { r.approvedAmount = r.amount; r.approvedVersion = r.contentVersion; }
    message = `${step.name}を記録`; r.stepIndex++; syncStatus(r);
  } else if (action === 'return' || action === 'reject') {
    if (!step || !['review', 'approve', 'settle'].includes(step.kind) || role !== step.role || payload.stepId !== step.id || action === 'reject' && step.kind !== 'approve') throw Error('この工程では差し戻し・却下できません。');
    r.status = action === 'return' ? 'returned' : 'rejected'; message = `${action === 'return' ? '差し戻し' : '却下'}：${reason()}`;
  } else if (action === 'actual') {
    requireStep('actual'); requireEmployee();
    if (r.actualRegistered) throw Error('購入実績は登録済みです。');
    const changed = ['title', 'purpose'].some(k => k in payload && payload[k] !== r[k]);
    updateContent(true); r.actualRegistered = true;
    r.purchaseActual = snapshot(r);
    if (r.amount > r.approvedAmount || changed) { r.stepIndex = 0; message = '購入実績を保持して変更内容を再確認・再承認へ'; }
    else { r.stepIndex++; message = '購入実績を登録'; }
    syncStatus(r);
  } else if (action === 'resubmit' || action === 'revise') {
    requireEmployee();
    if (action === 'resubmit' ? r.status !== 'returned' : r.type !== 'purchase' || r.actualRegistered || step?.kind !== 'actual') throw Error('この状態では変更・再申請できません。');
    updateContent(!['purchase', 'advance'].includes(r.type) || r.actualRegistered);
    // Keep the purchased fact and original actual snapshot; never require a second purchase.
    r.stepIndex = r.route.steps.findIndex(s => ['review', 'approve'].includes(s.kind)); syncStatus(r);
    message = '保存済みルートの最初から再確認・再承認';
  } else if (action === 'cancel') {
    requireEmployee();
    if (r.type !== 'purchase' || r.actualRegistered) throw Error('購入前だけ中止できます。');
    r.status = 'cancelled'; message = `購入中止：${reason()}`;
  } else if (action === 'complete') {
    requireStep('settle');
    if (r.settlement) throw Error('支給・精算は記録済みです。');
    const s = payload.settlement;
    if (!s || !validDate(s.date) || !['transfer', 'cash', 'company', 'refund'].includes(s.method) || !s.operator?.trim() || !Number.isSafeInteger(s.amount) || s.amount < 0 || s.amount > 99999999) throw Error('処理日・方法・担当者・処理金額を入力してください。');
    if (r.type === 'advance' && !['transfer', 'cash'].includes(s.method) || !r.advanceId && s.method === 'refund') throw Error('仮払い支給は振込・現金、返金は紐付けた仮払いの差額精算で記録してください。');
    if (!r.advanceId && s.amount !== r.amount) throw Error('処理金額は申請額と一致させてください。');
    r.settlement = { ...structuredClone(s), kind: r.type === 'advance' ? 'advance' : 'settlement', at: now() };
    r.stepIndex++; syncStatus(r); message = r.type === 'advance' ? '仮払い支給を記録（実費精算は未完了）' : '実費精算の処理を記録';
  } else throw Error('不明な操作です。');
  validateRequestProgress(r);
  r.revision++;
  r.history.push({ at: now(), actor: roles[role], message, stepId: step?.id, contentVersion: r.contentVersion, before: snapshot(original), snapshot: snapshot(r), settlement: structuredClone(r.settlement) });
  return r;
}
export function applyAction(records, id, action, role, payload) {
  const original = records.find(r => r.id === id);
  if (!original) throw Error('申請がありません。');
  checkAdvance(original, records);
  if (action === 'complete' && original.advanceId) {
    const { paid, actual, difference } = settlementAmounts(original, records);
    if (payload.settlement?.method === 'company' || payload.settlement?.amount !== Math.abs(difference) || difference < 0 && payload.settlement.method !== 'refund' || difference >= 0 && payload.settlement.method === 'refund') throw Error('差額と処理金額・方法が一致しません。返金は返金方法を選んでください。');
    payload = { ...payload, settlement: { ...payload.settlement, paid, actual, difference, advanceId: original.advanceId, kind: difference < 0 ? 'refund' : difference > 0 ? 'additional' : 'balanced' } };
  }
  const updated = transition(original, action, role, payload);
  if (updated.advanceId && updated.settlement) { updated.settlement.kind = payload.settlement.kind; updated.history.at(-1).settlement = structuredClone(updated.settlement); }
  return records.map(r => r.id === id ? updated : updated.status === 'done' && r.id === updated.advanceId ? { ...r, settledBy: id, revision: r.revision + 1, history: [...r.history, { at: now(), actor: roles[role], message: `実費精算 ${id} にて仮払いの差額精算を記録`, settlement: structuredClone(updated.settlement) }] } : r);
}
