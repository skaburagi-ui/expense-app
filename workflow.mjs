export const labels = { submitted: '社長の承認待ち', returned: '差し戻し', purchase_authorized: '購入・実績登録待ち', accounting: '経理の処理待ち', done: '処理完了', rejected: '却下', cancelled: '購入中止' };
export const roles = { employee: '社員', president: '社長', accountant: '経理' };
export const snapshot = r => ({ title: r.title, purpose: r.purpose, date: r.date, amount: r.amount, approvedAmount: r.approvedAmount, status: r.status, attachments: r.attachments.map(a => a.name) });
export function validate(values, receiptRequired = false) {
  if (!values.title?.trim() || !values.purpose?.trim() || !values.date) throw Error('件名・用途・日付を入力してください。');
  if (!Number.isSafeInteger(values.amount) || values.amount < 1 || values.amount > 99999999) throw Error('金額は1〜99,999,999円の整数で入力してください。');
  if (receiptRequired && !values.attachments?.length) throw Error('領収書を添付してください。');
}
export function transition(original, action, role, payload = {}) {
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
