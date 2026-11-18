export const requestTypes = { travel: '出張費精算', expense: '経費精算', purchase: '備品購入', advance: '仮払い' };
export const kinds = { review: '内容確認', approve: '社長承認', actual: '購入実績登録', settle: '支給・精算処理' };
const clone = x => structuredClone(x);
const step = (id, kind, role, name) => ({ id, kind, role, name });
export const directSteps = () => [step('approval', 'approve', 'president', '社長承認'), step('payment', 'settle', 'accountant', '支給・精算処理')];
export const purchaseSteps = () => [step('precheck', 'review', 'accountant', '経理事前確認'), step('approval', 'approve', 'president', '社長承認'), step('actual', 'actual', 'employee', '購入実績登録'), step('payment', 'settle', 'accountant', '購入後の精算処理')];
export function validateRoute(draft) {
  if (!draft || !Array.isArray(draft.types) || !draft.types.length || new Set(draft.types).size !== draft.types.length || draft.types.some(t => !requestTypes[t])) throw Error('対象の申請種類を選んでください。');
  const steps = draft.steps;
  if (!Array.isArray(steps) || !steps.length || steps.length > 20) throw Error('工程は1〜20件で設定してください。');
  const ids = new Set();
  for (const s of steps) {
    if (!s || typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(s.id) || ids.has(s.id) || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80) throw Error('工程IDは一意の英数字、工程名は1〜80文字で設定してください。');
    ids.add(s.id);
    if (!({ review: ['accountant', 'president'], approve: ['president'], actual: ['employee'], settle: ['accountant'] }[s.kind]?.includes(s.role))) throw Error('工程の担当と行為が一致していません。');
  }
  const approvals = steps.flatMap((s, i) => s.kind === 'approve' ? [i] : []);
  const payments = steps.flatMap((s, i) => s.kind === 'settle' ? [i] : []);
  const actuals = steps.flatMap((s, i) => s.kind === 'actual' ? [i] : []);
  if (!approvals.length) throw Error('社長承認が少なくとも1工程必要です。');
  if (payments.length !== 1 || payments[0] !== steps.length - 1 || payments[0] < Math.max(...approvals)) throw Error('支給・精算は承認後の最後に1工程必要です。');
  if (draft.types.includes('purchase')) {
    if (draft.types.length !== 1 || actuals.length !== 1 || actuals[0] < Math.max(...approvals) || actuals[0] >= payments[0]) throw Error('購入専用ルートは全承認後・精算前に実績登録が1工程必要です。');
    if (steps.slice(actuals[0] + 1).some(s => s.kind !== 'settle')) throw Error('購入実績の後は精算処理のみ設定できます。');
  } else if (actuals.length) throw Error('購入以外には購入実績工程を設定できません。');
  return true;
}
export function initialSettings() {
  const make = (id, name, types, steps) => ({ id, name, draft: { types, steps }, versions: [{ version: 1, types: clone(types), steps: clone(steps) }], stopped: false });
  return { revision: 0, patterns: [make('direct', '社長直接承認', ['advance', 'travel', 'expense'], directSteps()), make('checked', '経理確認あり', ['purchase'], purchaseSteps())], assignments: { advance: { patternId: 'direct', version: 1 }, travel: { patternId: 'direct', version: 1 }, expense: { patternId: 'direct', version: 1 }, purchase: { patternId: 'checked', version: 1 } }, history: [] };
}
export function configure(original, action, role, payload = {}) {
  if (role !== 'maintainer') throw Error('ルート設定は試用保守担当だけが操作できます。');
  if (payload.expectedRevision !== original.revision) throw Error('設定が更新されています。開き直してください。');
  const s = clone(original);
  let p = s.patterns.find(p => p.id === payload.id);
  if (action === 'save') {
    if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.length > 80) throw Error('パターン名を1〜80文字で入力してください。');
    if (!p) { p = { id: payload.id, versions: [], stopped: false }; if (!/^[a-zA-Z0-9_-]+$/.test(p.id || '')) throw Error('パターンIDが不正です。'); s.patterns.push(p); }
    p.name = payload.name.trim(); p.draft = clone(payload.draft);
  } else if (action === 'publish') {
    if (!p) throw Error('パターンがありません。');
    validateRoute(p.draft);
    p.versions.push({ ...clone(p.draft), version: (p.versions.at(-1)?.version || 0) + 1 }); p.stopped = false;
  } else if (action === 'stop') {
    if (!p || !p.versions.length || p.stopped) throw Error('停止できません。'); p.stopped = true;
  } else if (action === 'unassign') {
    if (!requestTypes[payload.type]) throw Error('申請種類が不正です。');
    delete s.assignments[payload.type];
  } else if (action === 'assign') {
    const v = p?.versions.find(v => v.version === payload.version);
    if (!v || p.stopped || !v.types.includes(payload.type)) throw Error('対象種類の有効な公開版を選んでください。');
    s.assignments[payload.type] = { patternId: p.id, version: v.version };
  } else throw Error('不明な設定操作です。');
  s.revision++;
  s.history.push({ at: new Date().toISOString(), actor: '試用保守担当', action, before: clone(original), revision: s.revision });
  // Each event keeps the previous configuration, without recursively copying older events.
  delete s.history.at(-1).before.history;
  return s;
}
export function assignedRoute(settings, type) {
  const a = settings.assignments[type];
  const p = settings.patterns.find(p => p.id === a?.patternId);
  const v = p?.versions.find(v => v.version === a?.version);
  if (!p || p.stopped || !v || !v.types.includes(type)) throw Error('公開ルートが未割当または新規利用停止中です。保守担当へ確認してください。');
  validateRoute(v);
  return { patternId: p.id, name: p.name, version: v.version, steps: clone(v.steps) };
}
export const currentStep = r => !['returned', 'done', 'disbursed', 'rejected', 'cancelled'].includes(r.status) ? r.route?.steps[r.stepIndex] : null;
export function syncStatus(r) {
  while (r.route.steps[r.stepIndex]?.kind === 'actual' && r.actualRegistered) r.stepIndex++;
  const s = r.route.steps[r.stepIndex];
  r.status = !s ? (r.type === 'advance' ? 'disbursed' : 'done') : ({ review: 'reviewing', approve: 'submitted', actual: 'purchase_authorized', settle: 'accounting' }[s.kind]);
  return r;
}
export function legacyRoute(r) {
  const steps = directSteps(); if (r.type === 'purchase') steps.splice(1, 0, step('actual', 'actual', 'employee', '購入実績登録'));
  return { patternId: 'legacy', name: '従来の社長直接承認（保存済み）', version: 1, steps, legacy: true };
}
// Shared by migration, persisted-state loading, and transitions. Do not infer approval from history.
export const validAmount = amount => Number.isSafeInteger(amount) && amount >= 1 && amount <= 99999999;
export function validateApprovalAmount(r, required = false) {
  if ((required || r.approvedAmount !== undefined) && !validAmount(r.approvedAmount)) throw Error('承認額が欠損または不正です。元データを保全して停止しました。');
}
export function validateRequestProgress(r) {
  const route = r.route;
  if (!route || typeof route.patternId !== 'string' || !route.patternId.trim() || !Number.isSafeInteger(route.version) || route.version < 1 || typeof route.name !== 'string' || !route.name.trim() || route.legacy !== undefined && typeof route.legacy !== 'boolean') throw Error('提出時ルートの識別情報が欠損または不正です。');
  validateRoute({ types: [r.type], steps: route.steps });
  const steps = route.steps, index = r.stepIndex;
  if (!Number.isSafeInteger(index) || index < 0 || index > steps.length || !Number.isSafeInteger(r.revision) || r.revision < 0 || !Number.isSafeInteger(r.contentVersion) || r.contentVersion < 1 || !validAmount(r.amount) || !validAmount(r.requestedAmount) || typeof r.actualRegistered !== 'boolean') throw Error('申請の工程・版・購入実績情報が欠損または不正です。');
  const kind = steps[index]?.kind;
  const expected = { review: 'reviewing', approve: 'submitted', actual: 'purchase_authorized', settle: 'accounting' }[kind];
  if (['returned', 'rejected', 'cancelled'].includes(r.status)) {
    const allowed = { returned: ['review', 'approve', 'settle'], rejected: ['approve'], cancelled: ['review', 'approve', 'actual'] }[r.status];
    if (!allowed.includes(kind) || r.status === 'cancelled' && (r.type !== 'purchase' || r.actualRegistered)) throw Error('例外状態と現在工程が一致しません。');
  } else if (index === steps.length ? r.status !== (r.type === 'advance' ? 'disbursed' : 'done') : r.status !== expected) throw Error('現在工程と状態が一致しません。');
  const actualIndex = steps.findIndex(s => s.kind === 'actual');
  if (r.type !== 'purchase' ? r.actualRegistered : index > actualIndex && !r.actualRegistered || kind === 'actual' && r.actualRegistered) throw Error('購入実績と現在工程が一致しません。');
  const approvalRequired = r.approvedVersion !== undefined || r.actualRegistered || steps.slice(0, index).some(s => s.kind === 'approve');
  validateApprovalAmount(r, approvalRequired);
  // A lower actual amount may legitimately have a newer contentVersion than its approval.
  if (r.approvedVersion !== undefined && (!Number.isSafeInteger(r.approvedVersion) || r.approvedVersion < 1 || r.approvedVersion > r.contentVersion)) throw Error('承認時の申請版が不正です。');
  if ((kind === 'settle' || index === steps.length) && r.amount > r.approvedAmount) throw Error('承認額を超えたまま支給・精算へ進めません。');
  return r;
}
export function migrateLegacy(records) {
  if (!Array.isArray(records)) throw Error('旧保存データが配列ではありません。元データを保全して停止しました。');
  const ids = new Set();
  return records.map(original => {
    if (!original || !['travel', 'expense', 'purchase'].includes(original.type) || typeof original.id !== 'string' || ids.has(original.id) || !['submitted', 'returned', 'purchase_authorized', 'accounting', 'done', 'rejected', 'cancelled'].includes(original.status) || typeof original.actualRegistered !== 'boolean' || !Number.isSafeInteger(original.requestedAmount) || original.requestedAmount < 1 || original.requestedAmount > 99999999 || !Array.isArray(original.history) || !Array.isArray(original.attachments) || !Number.isSafeInteger(original.amount) || original.amount < 1 || original.amount > 99999999 || ['title', 'purpose', 'date'].some(k => typeof original[k] !== 'string' || !original[k].trim()) || original.attachments.some(a => !a || typeof a.name !== 'string' || typeof a.data !== 'string') || original.history.some(h => !h || typeof h.actor !== 'string' || typeof h.message !== 'string' || typeof h.at !== 'string')) throw Error('旧申請に欠損・不正があります。元データを変更せず停止しました。');
    ids.add(original.id);
    const r = clone(original); r.route = legacyRoute(r); r.revision = 0; r.contentVersion = 1;
    r.stepIndex = ['submitted', 'returned', 'rejected', 'cancelled'].includes(r.status) ? 0 : r.status === 'purchase_authorized' ? 1 : r.status === 'accounting' ? r.route.steps.length - 1 : r.route.steps.length;
    if (r.status === 'purchase_authorized' && r.type !== 'purchase') throw Error('旧データの状態と種類が一致しません。');
    if (r.type === 'purchase' && (['accounting', 'done'].includes(r.status) && !r.actualRegistered || r.status === 'purchase_authorized' && r.actualRegistered)) throw Error('旧購入申請の実績と状態が一致しません。元データを保全して停止しました。');
    validateRequestProgress(r);
    return r;
  });
}
