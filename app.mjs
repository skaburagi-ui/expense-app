import { labels, roles, createRequest, applyAction, settlementAmounts } from './workflow.mjs';
import { requestTypes as types, kinds, configure, currentStep, validateRoute } from './routes.mjs';
import { openStore } from './storage.mjs';
const $ = s => document.querySelector(s);
const yen = n => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let store, state, records, loadError;
try { store = openStore(localStorage); state = store.state; records = state.records; } catch (e) { loadError = e.message; records = []; }
let role = 'employee', filter = 'all', editing = null, opened = null, detailRevision, toastTimer, settingId = null, draftSteps = [];
const persist = next => { state = store.save(next); records = state.records; };
const toast = message => { $('#toast').textContent = message; $('#toast').style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').style.display = 'none', 4500); };
const statusLabel = r => r.status === 'reviewing' ? (currentStep(r)?.role === 'accountant' ? '経理の事前確認待ち' : '社長の内容確認待ち') : r.status === 'disbursed' && r.settledBy ? '仮払い支給済み（実費精算済み）' : labels[r.status];
const progress = r => {
  const s = currentStep(r);
  if (r.status === 'returned') return `${r.stepIndex} / ${r.route.steps.length} 工程完了　現在：修正待ち ／ 担当：社員　次：${roles[r.route.steps.find(s => ['review', 'approve'].includes(s.kind))?.role]}`;
  return `${Math.min(r.stepIndex, r.route.steps.length)} / ${r.route.steps.length} 工程完了　${s ? `現在：${s.name} ／ 担当：${roles[s.role]}　次：${roles[r.route.steps[r.stepIndex + 1]?.role] || '終了'}` : statusLabel(r)}`;
};
function render() {
  $('#load-error').textContent = loadError || '';
  $('#new').hidden = role !== 'employee' || !!loadError;
  $('#settings-open').hidden = role !== 'maintainer' || !!loadError;
  $('#stats').innerHTML = [['reviewing', '経理の事前確認待ち'], ['submitted', '社長の承認待ち'], ['accounting', '経理の支給・精算待ち'], ['disbursed', '仮払い支給済み']].map(([s, t]) => `<div class="stat"><span>${t}</span><b>${records.filter(r => r.status === s && (s !== 'reviewing' || currentStep(r)?.role === 'accountant')).length}<small>件</small></b></div>`).join('');
  $('#list-title').textContent = { employee: '自分の申請', president: '承認・確認する申請', accountant: '経理で処理する申請', maintainer: '全申請の状況' }[role];
  $('#role-hint').textContent = role === 'employee' ? '種類に割り当てられた公開ルートで提出します。試作は架空の社員1名です。' : role === 'maintainer' ? '試用保守担当だけがルートを設定できます。' : '保存済みルートの現在工程に従って操作します。';
  const options = role === 'employee' || role === 'maintainer' ? [['all', 'すべて'], ['returned', '差し戻し'], ['done', '精算完了'], ['disbursed', '仮払い支給済み']] : [['all', '自分の工程待ち'], ['history', '全申請の状況']];
  $('#filters').innerHTML = options.map(([s, t]) => `<button data-filter="${s}" class="${filter === s ? 'selected' : ''}">${t}</button>`).join('');
  let list = records;
  if (['president', 'accountant'].includes(role)) { if (filter !== 'history') list = records.filter(r => currentStep(r)?.role === role); }
  else if (filter !== 'all') list = records.filter(r => r.status === filter);
  $('#list').innerHTML = list.length ? list.map(r => `<button class="row" data-open="${esc(r.id)}"><div><div class="row-meta">${esc(r.id)}　/　${types[r.type]}</div><div class="row-title">${esc(r.title)}</div><div class="row-meta">${esc(r.date)} ・ サンプル社員</div><div class="route-progress">${esc(progress(r))}</div></div><div class="amount">${yen(r.amount)}</div><span class="status ${r.status}">${statusLabel(r)}</span><span class="arrow">↗</span></button>`).join('') : '<div class="empty"><strong>対象の申請はありません</strong>役割を切り替えて、次の担当者の操作を試せます。</div>';
}
function historyContent(h, hi) {
  const content = (s, side) => `<dl class="detail-fields"><dt>件名</dt><dd>${esc(s.title)}</dd><dt>金額</dt><dd>${yen(s.amount)}</dd><dt>用途</dt><dd>${esc(s.purpose)}</dd><dt>添付</dt><dd>${(s.attachments || []).map(esc).join('、') || 'なし'} ${(s.attachmentFiles || []).map((a, ai) => `<button class="secondary" data-hfile="${hi},${side},${ai}">${esc(a.name)} を開く</button>`).join('')}</dd></dl>`;
  return `<li><small>${esc(new Date(h.at).toLocaleString('ja-JP'))} ・ ${esc(h.actor)} ${h.stepId ? `/ 工程 ${esc(h.stepId)}` : ''}</small>${esc(h.message)}${h.snapshot ? `<details><summary>その時点の内容${h.before ? '・変更前との比較' : ''}</summary>${h.before ? `<h4>変更前</h4>${content(h.before, 'before')}<h4>変更後</h4>` : ''}${content(h.snapshot, 'snapshot')}</details>` : ''}</li>`;
}
function showDetail(id) {
  const r = records.find(r => r.id === id); if (!r) return;
  opened = id; detailRevision = r.revision;
  const step = currentStep(r), mine = step?.role === role;
  let actions = '';
  if (mine && step.kind === 'approve') actions = '<button class="secondary danger" data-action="reject">却下</button><button class="secondary" data-action="return">差し戻す</button><button class="primary" data-action="approve">承認する</button>';
  if (mine && step.kind === 'review') actions = '<button class="secondary" data-action="return">差し戻す</button><button class="primary" data-action="review">内容確認を完了</button>';
  if (mine && step.kind === 'settle') actions = '<button class="secondary" data-action="return">差し戻す</button><button class="primary" data-action="complete">支給・精算処理を記録</button>';
  if (mine && step.kind === 'actual') actions = '<button class="secondary" data-edit="revise">購入前に内容変更・再申請</button><button class="primary" data-edit="actual">購入実績・領収書を登録</button>';
  if (role === 'employee' && r.status === 'returned') actions = '<button class="primary" data-edit="resubmit">修正して再申請</button>';
  const canCancel = role === 'employee' && r.type === 'purchase' && !r.actualRegistered && !['done', 'rejected', 'cancelled'].includes(r.status);
  if (canCancel) actions = '<button class="secondary danger" data-action="cancel">購入を中止する</button>' + actions;
  const reason = canCancel || mine && ['approve', 'review', 'settle'].includes(step.kind);
  const sums = settlementAmounts(r, records);
  const settlementForm = mine && step.kind === 'settle' ? `<fieldset><legend>${r.type === 'advance' ? '仮払い支給' : '実費精算'}の処理記録</legend><p>${r.type === 'advance' ? '支給予定額' : '実費'} ${yen(sums.actual)} ／ 支給済み仮払い ${yen(sums.paid)} ／ ${sums.difference < 0 ? '返金' : '支給'} ${yen(Math.abs(sums.difference))}</p><div class="form-grid"><label>処理金額（円）<input id="payment-amount" type="number" value="${Math.abs(sums.difference)}" min="0" max="99999999" step="1"></label><label>処理日<input id="payment-date" type="date" value="${new Date().toLocaleDateString('sv-SE')}"></label><label>処理方法<select id="payment-method"><option value="transfer">振込記録</option><option value="cash">現金記録</option>${r.type !== 'advance' && !r.advanceId ? '<option value="company">会社直接購入・返金なし</option>' : ''}${r.advanceId && sums.difference < 0 ? '<option value="refund" selected>返金記録</option>' : ''}</select></label><label>担当者（架空名）<input id="payment-operator" maxlength="80" placeholder="例：サンプル経理"></label></div></fieldset>` : '';
  $('#detail-content').innerHTML = `<div class="dialog-head"><div><div class="eyebrow">${esc(r.id)} / ${types[r.type]}</div><h2>${esc(r.title)}</h2></div><button class="close" data-close="detail" aria-label="閉じる">×</button></div><div class="detail-summary"><span class="status ${r.status}">${statusLabel(r)}</span><strong>${yen(r.amount)}</strong></div><p>${esc(progress(r))}</p><p class="muted">${esc(r.route.name)} / 公開版 ${r.route.version} ／ 申請内容の版 ${r.contentVersion}</p><ol class="route-steps">${r.route.steps.map((s, i) => `<li class="${i === r.stepIndex && step ? 'current' : ''}">${i < r.stepIndex ? '✓ ' : ''}${esc(s.name)}（${roles[s.role]}）<small>${esc(s.id)}</small></li>`).join('')}</ol><dl class="detail-fields"><dt>申請者</dt><dd>サンプル社員</dd><dt>日付</dt><dd>${esc(r.date)}</dd><dt>用途・明細</dt><dd>${esc(r.purpose)}</dd><dt>当初予定額</dt><dd>${yen(r.requestedAmount)}</dd><dt>前回承認額</dt><dd>${r.approvedAmount ? yen(r.approvedAmount) : '未承認'}</dd>${r.type === 'purchase' ? `<dt>購入実績</dt><dd>${r.actualRegistered ? '登録済み（再購入不要）' : '未登録'}</dd>` : ''}${r.advanceId ? `<dt>元の仮払い</dt><dd>${esc(r.advanceId)} ／ 支給済 ${yen(sums.paid)} ／ 差額 ${yen(sums.difference)}</dd>` : ''}${r.settledBy ? `<dt>実費精算</dt><dd>${esc(r.settledBy)} で精算済み</dd>` : ''}</dl>${r.settlement ? `<h3>処理記録</h3><p>${esc(r.settlement.date)} ／ ${esc(r.settlement.method)} ／ ${esc(r.settlement.operator)} ／ ${yen(r.settlement.amount)} ${r.type === 'advance' ? '（仮払い支給。実費精算とは別です）' : ''}</p>` : ''}<h3 class="section-title">添付ファイル</h3><div id="attachments">${r.attachments.length ? r.attachments.map((a, i) => `<button class="secondary attachment" data-file="${i}">↓ ${esc(a.name)}（${a.kind === 'quote' ? '見積書' : a.kind === 'receipt' ? '領収書' : '旧添付（領収書扱い）'}）</button>`).join('') : '<p class="muted">添付なし（初期サンプルは架空データです）</p>'}</div><h3 class="section-title">操作履歴</h3><ol class="history">${r.history.map(historyContent).join('')}</ol>${reason ? '<label class="reason-field">差し戻し・却下・購入中止の理由<textarea id="reason" rows="2" maxlength="1000"></textarea></label>' : ''}${settlementForm}<p id="detail-error" class="error" role="alert"></p>${actions ? `<div class="dialog-actions">${actions}</div>` : ''}`;
  if (!$('#detail').open) $('#detail').showModal();
}
function download(a) {
  if (!a || !/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(a.data)) { toast('この添付形式は開けません。'); return; }
  const link = document.createElement('a'); link.href = a.data; link.download = a.name; link.click();
}
function edit(mode = 'new') {
  const r = mode === 'new' ? null : records.find(r => r.id === opened);
  editing = { mode, id: r?.id, revision: r?.revision, stepId: currentStep(r || {})?.id, attachments: structuredClone(r?.attachments || []) };
  const form = $('#request-form'); form.reset();
  $('#form-title').textContent = { new: '新しい申請', actual: '購入実績を登録', resubmit: '申請を修正', revise: '購入前の内容を変更' }[mode];
  $('#form-note').textContent = mode === 'actual' ? '実際の品目・用途・金額と領収書を登録。増額や品目・用途の変更は、購入済み実績を保持して再確認・再承認します。' : mode === 'new' ? '申請種類に割り当てられた公開ルートを使用します。' : '提出時に保存したルートの最初から再確認・再承認します。';
  for (const name of ['title', 'purpose', 'amount', 'date', 'type']) form.elements[name].value = r?.[name] ?? (name === 'date' ? new Date().toLocaleDateString('sv-SE') : name === 'type' ? 'travel' : '');
  form.elements.type.disabled = mode !== 'new';
  $('#type-label').hidden = mode !== 'new';
  const available = records.filter(a => a.type === 'advance' && a.status === 'disbursed' && !a.settledBy && !records.some(x => x.advanceId === a.id && !['rejected', 'cancelled'].includes(x.status)));
  form.elements.advanceId.innerHTML = '<option value="">紐付けなし</option>' + available.map(a => `<option value="${esc(a.id)}">${esc(a.title)} / ${yen(a.settlement.amount)}</option>`).join('');
  $('#advance-label').hidden = mode !== 'new' || !['travel', 'expense'].includes(form.elements.type.value);
  $('#form-error').textContent = ''; $('#submit-form').textContent = mode === 'actual' ? '購入実績を登録する' : '保存済みのルートへ提出';
  renderExisting(); updateRouteNote(); $('#detail').close(); $('#editor').showModal();
}
function updateRouteNote() {
  const type = $('#request-form').elements.type.value;
  $('#advance-label').hidden = editing.mode !== 'new' || !['travel', 'expense'].includes(type);
  const a = state.settings.assignments[type], p = state.settings.patterns.find(p => p.id === a?.patternId), v = p?.versions.find(v => v.version === a?.version);
  $('#route-note').textContent = editing.mode === 'new' ? p && !p.stopped && v ? `${p.name} v${v.version}：${v.steps.map(s => s.name).join(' → ')}` : 'ルート未割当・新規利用停止中のため提出できません。' : '提出時の保存済みルートを使用します。';
}
function renderExisting() { $('#existing-files').innerHTML = editing.attachments.map((a, i) => `<div class="muted">${esc(a.name)}（${a.kind === 'quote' ? '見積書' : a.kind === 'receipt' ? '領収書' : '旧添付（領収書扱い）'}） <button type="button" class="secondary" data-remove="${i}">今回の版から外す</button></div>`).join(''); }
async function readFiles(files) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  if (files.some(f => !allowed.has(f.type))) throw Error('添付できるのはJPEG・PNG・WebP・PDFです。');
  const total = files.reduce((n, f) => n + f.size, 0) + editing.attachments.reduce((n, a) => n + (a.size || 0), 0);
  if (total > 3 * 1024 * 1024) throw Error('添付は既存分と合わせて合計3MB以内にしてください。');
  const kind = $('#request-form').elements.fileKind.value;
  return Promise.all(files.map(file => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, kind, size: file.size, data: reader.result }); reader.onerror = reader.onabort = () => reject(Error('ファイルを読み込めませんでした。')); reader.readAsDataURL(file);
  })));
}
$('#request-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#form-error').textContent = ''; $('#submit-form').disabled = true;
  try {
    const f = event.currentTarget.elements;
    const payload = { type: f.type.value, title: f.title.value.trim(), purpose: f.purpose.value.trim(), date: f.date.value, amount: Number(f.amount.value), attachments: [...editing.attachments, ...await readFiles([...f.files.files])], expectedRevision: editing.revision, stepId: editing.stepId, advanceId: $('#advance-label').hidden ? null : f.advanceId.value };
    const next = editing.mode === 'new' ? [createRequest(payload, state.settings, role, records), ...records] : applyAction(records, editing.id, editing.mode, role, payload);
    persist({ ...state, records: next }); $('#editor').close(); filter = 'all'; render(); toast('保存しました。');
  } catch (e) { $('#form-error').textContent = e.message; }
  finally { $('#submit-form').disabled = false; }
});
$('#request-form').elements.type.addEventListener('change', updateRouteNote);
function showSettings(id = state.settings.patterns[0]?.id) {
  settingId = id; const p = state.settings.patterns.find(p => p.id === id);
  draftSteps = structuredClone(p?.draft?.steps || []);
  $('#pattern-select').innerHTML = '<option value="">新規パターン</option>' + state.settings.patterns.map(p => `<option value="${esc(p.id)}">${esc(p.name)} ${p.stopped ? '（新規利用停止）' : p.versions.length ? '（公開版あり）' : '（下書き）'}</option>`).join('');
  $('#pattern-select').value = id || '';
  $('#pattern-name').value = p?.name || '';
  $('#pattern-types').innerHTML = Object.entries(types).map(([t, name]) => `<label class="check-label"><input type="checkbox" value="${t}" ${p?.draft?.types?.includes(t) ? 'checked' : ''}>${name}</label>`).join('');
  $('#settings-error').textContent = ''; $('#preview').textContent = '';
  $('#pattern-state').textContent = p ? `公開版 ${p.versions.map(v => v.version).join('、') || 'なし'} ／ ${p.stopped ? '新規利用停止中（既存申請は継続）' : '新規利用可能（下書き変更は公開版へ未反映）'}` : '新しいパターンを下書き保存してください。';
  renderSteps(); renderAssignments();
  $('#settings-history').innerHTML = state.settings.history.slice().reverse().map(h => `<li>${esc(h.at)} ／ ${esc(h.actor)} ／ ${esc(h.action)} ／ 更新 ${h.revision}</li>`).join('');
  if (!$('#settings').open) $('#settings').showModal();
}
function renderSteps() {
  $('#step-editor').innerHTML = draftSteps.map((s, i) => `<div class="step-editor-row" data-step="${i}"><span>${i + 1}</span><label>工程名<input data-step-name value="${esc(s.name)}" maxlength="80"></label><label>行為<select data-step-kind>${Object.entries(kinds).map(([k, name]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label>担当<select data-step-role>${['accountant', 'president', 'employee'].map(k => `<option value="${k}" ${s.role === k ? 'selected' : ''}>${roles[k]}</option>`).join('')}</select></label><div class="step-buttons"><button type="button" class="secondary" data-up="${i}" aria-label="工程${i + 1}を上へ">↑</button><button type="button" class="secondary" data-down="${i}" aria-label="工程${i + 1}を下へ">↓</button><button type="button" class="secondary" data-delete-step="${i}">削除</button></div></div>`).join('');
}
function readDraft() {
  $('#step-editor').querySelectorAll('[data-step]').forEach(row => { const s = draftSteps[Number(row.dataset.step)]; s.name = row.querySelector('[data-step-name]').value.trim(); s.kind = row.querySelector('[data-step-kind]').value; s.role = row.querySelector('[data-step-role]').value; });
  return { types: [...$('#pattern-types').querySelectorAll('input:checked')].map(x => x.value), steps: structuredClone(draftSteps) };
}
function renderAssignments() {
  $('#assignment-list').innerHTML = Object.entries(types).map(([t, name]) => {
    const a = state.settings.assignments[t];
    return `<label>${name}<select data-assignment="${t}"><option value="">未割当</option>${state.settings.patterns.flatMap(p => p.versions.filter(v => v.types.includes(t)).map(v => `<option value="${esc(p.id)}:${v.version}" ${a?.patternId === p.id && a.version === v.version ? 'selected' : ''} ${p.stopped ? 'disabled' : ''}>${esc(p.name)} v${v.version}${p.stopped ? '（新規利用停止）' : ''}</option>`)).join('')}</select></label>`;
  }).join('');
}
function changeSettings(action, payload) {
  const settings = configure(state.settings, action, role, { ...payload, expectedRevision: state.settings.revision });
  persist({ ...state, settings }); render();
}
$('#settings-open').addEventListener('click', () => showSettings());
$('#pattern-select').addEventListener('change', e => showSettings(e.target.value || null));
$('#add-step').addEventListener('click', () => { readDraft(); draftSteps.push({ id: `step-${crypto.randomUUID()}`, name: '内容確認', kind: 'review', role: 'accountant' }); renderSteps(); });
$('#pattern-save').addEventListener('click', () => {
  try { const id = settingId || `pattern-${crypto.randomUUID()}`; changeSettings('save', { id, name: $('#pattern-name').value, draft: readDraft() }); showSettings(id); toast('下書きを保存しました。公開版と割当は変わりません。'); }
  catch (e) { $('#settings-error').textContent = e.message; }
});
$('#pattern-preview').addEventListener('click', () => {
  try { const d = readDraft(); validateRoute(d); $('#settings-error').textContent = ''; $('#preview').innerHTML = `<h3>公開前プレビュー</h3>${d.types.map(t => `<p>${types[t]}：社員が提出 → ${d.steps.map(s => `${esc(s.name)}（${roles[s.role]}）`).join(' → ')} → ${t === 'advance' ? '支給済み・後日実費精算' : '処理完了'}</p>`).join('')}`; }
  catch (e) { $('#settings-error').textContent = e.message; $('#preview').textContent = ''; }
});
$('#pattern-publish').addEventListener('click', () => {
  try {
    const p = state.settings.patterns.find(p => p.id === settingId);
    if (!p || p.name !== $('#pattern-name').value.trim() || JSON.stringify(p.draft) !== JSON.stringify(readDraft())) throw Error('変更内容を先に下書き保存してください。');
    changeSettings('publish', { id: settingId }); showSettings(settingId); toast('新しい版を公開しました。申請種類への割当で使用版を選んでください。');
  } catch (e) { $('#settings-error').textContent = e.message; }
});
$('#pattern-stop').addEventListener('click', () => {
  try { changeSettings('stop', { id: settingId }); showSettings(settingId); toast('新規利用を停止しました。提出済み申請は保存済みルートで継続します。'); }
  catch (e) { $('#settings-error').textContent = e.message; }
});
$('#assign-save').addEventListener('click', () => {
  try {
    let settings = state.settings;
    for (const sel of $('#assignment-list').querySelectorAll('select')) {
      if (!sel.value) { if (settings.assignments[sel.dataset.assignment]) settings = configure(settings, 'unassign', role, { type: sel.dataset.assignment, expectedRevision: settings.revision }); continue; }
      const [id, version] = sel.value.split(':'); const a = settings.assignments[sel.dataset.assignment];
      if (a?.patternId === id && a.version === Number(version)) continue;
      settings = configure(settings, 'assign', role, { id, version: Number(version), type: sel.dataset.assignment, expectedRevision: settings.revision });
    }
    persist({ ...state, settings }); render(); showSettings(settingId); toast('公開版の割当を保存しました。');
  } catch (e) { $('#settings-error').textContent = e.message; }
});
document.addEventListener('click', e => {
  const button = e.target.closest('button'); if (!button) return;
  if (button.dataset.close) $(`#${button.dataset.close}`).close();
  if (button.dataset.open) showDetail(button.dataset.open);
  if (button.dataset.filter) { filter = button.dataset.filter; render(); }
  if (button.dataset.edit) edit(button.dataset.edit);
  if (button.dataset.remove !== undefined) { editing.attachments = editing.attachments.filter((_, i) => i !== Number(button.dataset.remove)); renderExisting(); }
  if (button.dataset.file !== undefined) download(records.find(r => r.id === opened)?.attachments[Number(button.dataset.file)]);
  if (button.dataset.hfile) { const [hi, side, ai] = button.dataset.hfile.split(','); download(records.find(r => r.id === opened)?.history[hi]?.[side]?.attachmentFiles[ai]); }
  for (const op of ['up', 'down', 'deleteStep']) if (button.dataset[op] !== undefined) {
    readDraft(); const i = Number(button.dataset[op]), j = op === 'up' ? i - 1 : i + 1;
    if (op === 'deleteStep') draftSteps.splice(i, 1); else if (j >= 0 && j < draftSteps.length) [draftSteps[i], draftSteps[j]] = [draftSteps[j], draftSteps[i]];
    renderSteps();
  }
  if (button.dataset.action) {
    try {
      const r = records.find(r => r.id === opened);
      const payload = { reason: $('#reason')?.value, expectedRevision: detailRevision, stepId: currentStep(r)?.id };
      if (button.dataset.action === 'complete') payload.settlement = { date: $('#payment-date').value, amount: Number($('#payment-amount').value), method: $('#payment-method').value, operator: $('#payment-operator').value.trim() };
      persist({ ...state, records: applyAction(records, opened, button.dataset.action, role, payload) }); render(); showDetail(opened); toast('更新しました。');
    } catch (error) { $('#detail-error').textContent = error.message; }
  }
});
$('#role').addEventListener('change', e => { role = e.target.value; filter = 'all'; $('#detail').close(); $('#editor').close(); $('#settings').close(); render(); });
$('#new').addEventListener('click', () => edit());
window.addEventListener('storage', () => { toast('別画面で保存データが変わりました。操作前に再読み込みしてください。'); });
render();
