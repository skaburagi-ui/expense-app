import { initialSettings, migrateLegacy, validateRoute, validateRequestProgress, requestTypes } from './routes.mjs';
import { seed, validate, validDate } from './workflow.mjs';
export const storageKey = 'expense-prototype-v2';
export const legacyKey = 'expense-prototype-v1';
export function validateState(s) {
  if (!s || s.schema !== 2 || !Number.isSafeInteger(s.revision) || !Array.isArray(s.records) || !s.settings || !Array.isArray(s.settings.patterns) || !s.settings.assignments || !Array.isArray(s.settings.history) || !Number.isSafeInteger(s.settings.revision)) throw Error('保存形式が不正です。元データを保全して停止しました。');
  const patternIds = new Set();
  for (const p of s.settings.patterns) {
    if (!p || typeof p.id !== 'string' || patternIds.has(p.id) || typeof p.name !== 'string' || !Array.isArray(p.versions) || !p.draft || !Array.isArray(p.draft.types) || !Array.isArray(p.draft.steps) || p.draft.steps.some(step => !step || typeof step.id !== 'string' || typeof step.name !== 'string' || typeof step.kind !== 'string' || typeof step.role !== 'string') || typeof p.stopped !== 'boolean') throw Error('ルート設定データが不正です。');
    patternIds.add(p.id); const versions = new Set();
    for (const v of p.versions) { validateRoute(v); if (!Number.isSafeInteger(v.version) || v.version < 1 || versions.has(v.version)) throw Error('ルート版が不正です。'); versions.add(v.version); }
  }
  for (const [type, a] of Object.entries(s.settings.assignments)) {
    if (!requestTypes[type] || !s.settings.patterns.find(p => p.id === a?.patternId)?.versions.some(v => v.version === a.version && v.types.includes(type))) throw Error('ルート割当が不正です。');
  }
  const ids = new Set();
  for (const r of s.records) {
    if (!r || !requestTypes[r.type] || typeof r.id !== 'string' || ids.has(r.id) || !Array.isArray(r.history) || !Array.isArray(r.attachments) || !r.route || !Array.isArray(r.route.steps) || !Number.isSafeInteger(r.revision) || !Number.isSafeInteger(r.contentVersion) || !Number.isSafeInteger(r.stepIndex) || r.stepIndex < 0 || r.stepIndex > r.route.steps.length || !Number.isSafeInteger(r.amount) || r.amount < 1 || r.amount > 99999999 || ['title', 'purpose', 'date'].some(k => typeof r[k] !== 'string' || !r[k].trim()) || !['submitted', 'reviewing', 'returned', 'purchase_authorized', 'accounting', 'done', 'disbursed', 'rejected', 'cancelled'].includes(r.status) || r.attachments.some(a => !a || typeof a.name !== 'string' || typeof a.data !== 'string') || r.history.some(h => !h || typeof h.message !== 'string' || typeof h.actor !== 'string' || typeof h.at !== 'string')) throw Error('申請データに欠損・不正があります。元データを保全して停止しました。');
    ids.add(r.id);
    validate(r, false);
    if (r.settlement && (!validDate(r.settlement.date) || !Number.isSafeInteger(r.settlement.amount) || r.settlement.amount < 0 || !['transfer', 'cash', 'company', 'refund'].includes(r.settlement.method) || typeof r.settlement.operator !== 'string' || !r.settlement.operator.trim())) throw Error('処理記録が不正です。');
    if (!r.route.legacy && ['done', 'disbursed'].includes(r.status) && !r.settlement) throw Error('終了申請の処理記録がありません。');
    validateRequestProgress(r);
  }
  const links = new Set();
  for (const r of s.records.filter(r => r.advanceId && !['rejected', 'cancelled'].includes(r.status))) {
    const a = s.records.find(a => a.id === r.advanceId);
    if (!['travel', 'expense'].includes(r.type) || !a || a.type !== 'advance' || a.status !== 'disbursed' || !a.settlement || links.has(a.id) || a.applicant !== r.applicant || a.settledBy && a.settledBy !== r.id || r.status === 'done' && a.settledBy !== r.id) throw Error('仮払いの紐付けに不整合があります。');
    links.add(a.id);
  }
  return s;
}
export function openStore(storage) {
  let token = storage.getItem(storageKey);
  let state;
  if (token !== null) {
    try { state = validateState(JSON.parse(token)); } catch (e) { throw Error(`保存データを開けません。自動リセットは行いません。${e.message}`); }
  } else {
    const raw = storage.getItem(legacyKey);
    let old;
    try { old = raw === null ? seed() : JSON.parse(raw); } catch { throw Error('旧保存データのJSONが不正です。自動リセットは行いません。'); }
    state = validateState({ schema: 2, revision: 0, records: migrateLegacy(old), settings: initialSettings() });
    // Never remove or overwrite v1: it is the exact original backup, including attachments/history.
    const encoded = JSON.stringify(state);
    try { storage.setItem(storageKey, encoded); token = encoded; } catch { throw Error('新形式へ保存できません。旧データは変更していません。保存設定・容量を確認してください。'); }
  }
  return {
    state,
    save(next) {
      if (storage.getItem(storageKey) !== token) throw Error('別画面で保存が更新されました。この画面を再読み込みしてください。');
      validateState(next);
      const updated = { ...next, revision: this.state.revision + 1 };
      const encoded = JSON.stringify(updated);
      try { storage.setItem(storageKey, encoded); } catch { throw Error('保存できませんでした。操作は未確定です。添付サイズ・保存容量を確認してください。'); }
      token = encoded; this.state = updated; return updated;
    }
  };
}
