import { labels, roles, transition, validate, seed, snapshot } from './workflow.mjs';
const $ = s => document.querySelector(s);
const key = 'expense-prototype-v1';
const types = { travel: '出張費精算', expense: '経費精算', purchase: '備品購入' };
const yen = n => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let records;
try { records = JSON.parse(localStorage.getItem(key)) || seed(); if (!Array.isArray(records)) throw Error(); }
catch { records = seed(); }
let role = 'employee', filter = 'all', editing = null, opened = null, toastTimer;
const persist = next => {
  try { localStorage.setItem(key, JSON.stringify(next)); records = next; }
  catch { throw Error('ブラウザーへ保存できませんでした。添付ファイルを小さくするか、保存設定を確認してください。'); }
};
const toast = message => { $('#toast').textContent = message; $('#toast').style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').style.display = 'none', 4500); };
function render() {
  $('#stats').innerHTML = [['submitted', '社長の承認待ち'], ['accounting', '経理の処理待ち'], ['done', '処理完了']].map(([s, t]) => `<div class="stat"><span>${t}</span><b>${records.filter(r => r.status === s).length}<small>件</small></b></div>`).join('');
  $('#list-title').textContent = { employee: '自分の申請', president: '承認する申請', accountant: '経理で処理する申請' }[role];
  $('#role-hint').textContent = { employee: '試作では全申請を同じ社員のものとして扱います。', president: '社員から直接届く申請を確認できます。', accountant: '社長が承認した申請を処理できます。' }[role];
  $('#new').hidden = role !== 'employee';
  const options = role === 'employee' ? [['all', 'すべて'], ['submitted', '承認待ち'], ['purchase_authorized', '購入待ち'], ['returned', '差し戻し'], ['done', '完了']] : role === 'president' ? [['all', '承認待ち'], ['history', '全申請の状況']] : [['all', '処理待ち'], ['done', '処理完了']];
  $('#filters').innerHTML = options.map(([s, t]) => `<button data-filter="${s}" class="${filter === s ? 'selected' : ''}">${t}</button>`).join('');
  let list = records;
  if (role === 'president') list = filter === 'history' ? records : records.filter(r => r.status === 'submitted');
  else if (role === 'accountant') list = records.filter(r => r.status === (filter === 'done' ? 'done' : 'accounting'));
  else if (filter !== 'all') list = records.filter(r => r.status === filter);
  $('#list').innerHTML = list.length ? list.map(r => `<button class="row" data-open="${esc(r.id)}"><div><div class="row-meta">${esc(r.id)}　/　${types[r.type]}</div><div class="row-title">${esc(r.title)}</div><div class="row-meta">${esc(r.date)} ・ サンプル社員</div></div><div class="amount">${yen(r.amount)}</div><span class="status ${r.status}">${labels[r.status]}</span><span class="arrow">↗</span></button>`).join('') : '<div class="empty"><strong>対象の申請はありません</strong>役割を切り替えて、次の担当者の操作を試せます。</div>';
}
function historyContent(h) {
  const content = s => `<dl class="detail-fields"><dt>件名</dt><dd>${esc(s.title)}</dd><dt>日付</dt><dd>${esc(s.date)}</dd><dt>金額</dt><dd>${yen(s.amount)}</dd><dt>用途・明細</dt><dd>${esc(s.purpose)}</dd><dt>添付名</dt><dd>${s.attachments.length ? s.attachments.map(esc).join('、') : 'なし'}</dd></dl>`;
  return `<li><small>${esc(new Date(h.at).toLocaleString('ja-JP'))} ・ ${esc(h.actor)}</small>${esc(h.message)}${h.snapshot ? `<details><summary>その時点の内容${h.before ? '・変更前との比較' : ''}</summary>${h.before ? `<h4>変更前</h4>${content(h.before)}<h4>変更後</h4>` : ''}${content(h.snapshot)}</details>` : ''}</li>`;
}
function showDetail(id) {
  const r = records.find(r => r.id === id); if (!r) return;
  opened = id;
  let actions = '';
  if (role === 'president' && r.status === 'submitted') actions = '<button class="secondary danger" data-action="reject">却下</button><button class="secondary" data-action="return">差し戻す</button><button class="primary" data-action="approve">承認する</button>';
  if (role === 'accountant' && r.status === 'accounting') actions = '<button class="secondary" data-action="return">差し戻す</button><button class="primary" data-action="complete">精算・処理済みにする</button>';
  if (role === 'employee' && r.status === 'purchase_authorized') actions = '<button class="secondary" data-edit="revise">購入前に内容変更・再申請</button><button class="primary" data-edit="actual">購入実績・領収書を登録</button>';
  if (role === 'employee' && r.status === 'returned') actions = '<button class="primary" data-edit="resubmit">修正して再申請</button>';
  const canCancel = role === 'employee' && r.type === 'purchase' && !r.actualRegistered && ['submitted', 'returned', 'purchase_authorized'].includes(r.status);
  if (canCancel) actions = '<button class="secondary danger" data-action="cancel">購入を中止する</button>' + actions;
  const reason = canCancel || role === 'president' && r.status === 'submitted' || role === 'accountant' && r.status === 'accounting';
  $('#detail-content').innerHTML = `<div class="dialog-head"><div><div class="eyebrow">${esc(r.id)} / ${types[r.type]}</div><h2>${esc(r.title)}</h2></div><button class="close" data-close="detail" aria-label="閉じる">×</button></div><div class="detail-summary"><span class="status ${r.status}">${labels[r.status]}</span><strong>${yen(r.amount)}</strong></div><dl class="detail-fields"><dt>申請者</dt><dd>サンプル社員</dd><dt>日付</dt><dd>${esc(r.date)}</dd><dt>用途・明細</dt><dd>${esc(r.purpose)}</dd>${r.type === 'purchase' ? `<dt>当初予定額</dt><dd>${yen(r.requestedAmount)}</dd><dt>${['submitted', 'returned'].includes(r.status) && r.approvedAmount ? '前回承認額' : '承認額'}</dt><dd>${r.approvedAmount ? yen(r.approvedAmount) : '未承認'}</dd><dt>購入実績</dt><dd>${r.actualRegistered ? '登録済み' : '未登録'}</dd>` : ''}</dl><h3 class="section-title">添付ファイル</h3><div id="attachments">${r.attachments.length ? '' : '<p class="muted">添付なし（初期サンプルは架空データです）</p>'}</div><h3 class="section-title">操作履歴</h3><ol class="history">${r.history.map(historyContent).join('')}</ol>${reason ? '<label class="reason-field">差し戻し・却下・購入中止の理由<textarea id="reason" rows="2" maxlength="1000" placeholder="社員へ伝える修正内容など"></textarea></label>' : ''}<p id="detail-error" class="error" role="alert"></p>${actions ? `<div class="dialog-actions">${actions}</div>` : ''}`;
  for (const [i, a] of r.attachments.entries()) {
    const button = document.createElement('button'); button.className = 'secondary attachment'; button.textContent = `↓ ${a.name}`;
    button.addEventListener('click', () => downloadAttachment(r.id, i)); $('#attachments').append(button);
  }
  if (!$('#detail').open) $('#detail').showModal();
}
function downloadAttachment(id, index) {
  const a = records.find(r => r.id === id)?.attachments[index]; if (!a) return;
  if (!/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(a.data)) { toast('この添付形式は開けません。'); return; }
  const link = document.createElement('a'); link.href = a.data; link.download = a.name; link.click();
}
function edit(mode = 'new') {
  const r = mode === 'new' ? null : records.find(r => r.id === opened);
  editing = { mode, id: r?.id, attachments: r?.attachments || [] };
  const form = $('#request-form'); form.reset();
  $('#form-title').textContent = { new: '新しい申請', actual: '購入実績を登録', resubmit: '申請を修正', revise: '購入前の内容を変更' }[mode];
  $('#form-note').textContent = mode === 'revise' ? '購入前の変更を社長へ再申請します。再承認まで購入はできません。' : mode === 'actual' ? '購入金額と領収書を登録します。承認額を超えた場合は、社長へ再申請します。' : '申請は経理を経由せず、社長へ直接届きます。';
  for (const name of ['title', 'purpose', 'amount', 'date', 'type']) form.elements[name].value = r?.[name] ?? (name === 'date' ? new Date().toLocaleDateString('sv-SE') : name === 'type' ? 'travel' : '');
  form.elements.type.disabled = mode !== 'new';
  for (const name of ['title', 'purpose', 'date']) form.elements[name].readOnly = mode === 'actual';
  $('#type-label').hidden = mode !== 'new';
  $('#form-error').textContent = '';
  $('#submit-form').textContent = mode === 'actual' ? '購入実績を登録する' : ['resubmit', 'revise'].includes(mode) ? '社長へ再申請する' : '社長へ申請する';
  renderExisting();
  $('#detail').close(); $('#editor').showModal();
}
function renderExisting() {
  $('#existing-files').innerHTML = editing.attachments.map((a, i) => `<div class="muted">${esc(a.name)} <button type="button" class="secondary" data-remove="${i}">削除</button></div>`).join('');
}
async function readFiles(files) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  if (files.some(f => !allowed.has(f.type))) throw Error('添付できるのはJPEG・PNG・WebP・PDFです。');
  const total = files.reduce((n, f) => n + f.size, 0) + editing.attachments.reduce((n, a) => n + a.size, 0);
  if (total > 3 * 1024 * 1024) throw Error('添付ファイルは既存分と合わせて合計3MB以内にしてください。');
  return Promise.all(files.map(file => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, size: file.size, data: reader.result }); reader.onerror = () => reject(Error('ファイルを読み込めませんでした。')); reader.readAsDataURL(file);
  })));
}
$('#request-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#form-error').textContent = ''; $('#submit-form').disabled = true;
  try {
    const f = event.currentTarget.elements;
    const payload = { type: f.type.value, title: f.title.value.trim(), purpose: f.purpose.value.trim(), date: f.date.value, amount: Number(f.amount.value), attachments: [...editing.attachments, ...await readFiles([...f.files.files])] };
    let next;
    if (editing.mode === 'new') {
      validate(payload, payload.type !== 'purchase');
      const r = { ...payload, id: `EX-${Date.now()}`, requestedAmount: payload.amount, actualRegistered: false, status: 'submitted', history: [{ at: new Date().toISOString(), actor: roles.employee, message: '社長へ申請', snapshot: snapshot({ ...payload, status: 'submitted' }) }] };
      next = [r, ...records];
    } else next = records.map(r => r.id === editing.id ? transition(r, editing.mode, role, payload) : r);
    persist(next); $('#editor').close(); filter = 'all'; render(); toast('保存しました。役割を切り替えて次の操作を試せます。');
  } catch (e) { $('#form-error').textContent = e.message; }
  finally { $('#submit-form').disabled = false; }
});
document.addEventListener('click', e => {
  const button = e.target.closest('button'); if (!button) return;
  if (button.dataset.close) $(`#${button.dataset.close}`).close();
  if (button.dataset.open) showDetail(button.dataset.open);
  if (button.dataset.filter) { filter = button.dataset.filter; render(); }
  if (button.dataset.edit) edit(button.dataset.edit);
  if (button.dataset.remove !== undefined) { editing.attachments = editing.attachments.filter((_, i) => i !== Number(button.dataset.remove)); renderExisting(); }
  if (button.dataset.action) {
    try {
      const next = records.map(r => r.id === opened ? transition(r, button.dataset.action, role, { reason: $('#reason')?.value }) : r);
      persist(next); render(); showDetail(opened); toast('更新しました。');
    } catch (error) { $('#detail-error').textContent = error.message; }
  }
});
$('#role').addEventListener('change', e => { role = e.target.value; filter = 'all'; $('#detail').close(); $('#editor').close(); render(); });
$('#new').addEventListener('click', () => edit());
$('#reset').addEventListener('click', () => {
  if (confirm('このブラウザーの試作データを消して、初期の架空データに戻しますか？')) {
    try { persist(seed()); filter = 'all'; render(); toast('架空データに戻しました。'); } catch (e) { toast(e.message); }
  }
});
render();
