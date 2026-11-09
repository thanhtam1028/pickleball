import { esc } from '../dom.js';
import { watchEvent, subDoc, save, requireAdmin } from '../data.js';
import { withDefaults } from '../core/settings.js';
import { rulesFor, applyEvent, initialState, effectiveEvents, callout, parseGamesText } from '../core/scoring.js';
import { courtName, scoreText, STATUS_LABEL } from '../match-format.js';

const timeOf = (ts) => (ts?.toDate ? ts.toDate().toLocaleTimeString('vi-VN') : '');

// Nhật ký trận (chỉ ban tổ chức): từng pha, ai bấm, lúc nào; sửa tỷ số cuối kèm lý do khi có khiếu nại.
export function render(el, { session, params }) {
  el.innerHTML = '<p class="muted small"><a href="#/xep-lich">‹ Xếp lịch</a></p><h1>Nhật ký trận</h1>';
  const fs = requireAdmin(el, session);
  if (!fs) return null;
  const matchRef = subDoc(fs, 'matches', params.id);
  let settings = withDefaults();
  let match = null;
  let rallies = [];
  let people = new Map([[session.user.uid, session.user.name]]);
  const body = document.createElement('div');
  body.className = 'stack';
  el.append(body);

  function describe(ev) {
    const team = (t) => esc(match?.[t?.toLowerCase()]?.name || t);
    if (ev.type === 'rally') return `${team(ev.winner)} thắng pha`;
    if (ev.type === 'timeout') return `${team(ev.team)} xin hội ý`;
    if (ev.type === 'undo') return '<b>Hoàn tác</b> pha trước';
    return esc(ev.type);
  }

  function rows() {
    // Tính lại điểm sau từng dòng nhật ký để thấy diễn biến.
    const rules = rulesFor(settings, match);
    return rallies.map((ev, i) => {
      const upto = effectiveEvents(rallies.slice(0, i + 1));
      const s = upto.reduce(applyEvent, initialState(rules, match.firstServer || 'A'));
      return `<tr class="${ev.type === 'undo' ? 'undo-row' : ''}">
        <td>${ev.seq}</td><td>${esc(timeOf(ev.at))}</td><td>${describe(ev)}</td>
        <td>${esc(callout(s))}${s.games.length ? ` <span class="muted small">(${s.games.map((g) => `${g.a}–${g.b}`).join(', ')})</span>` : ''}</td>
        <td class="small">${esc(people.get(ev.by) || ev.by || '')}</td></tr>`;
    }).join('');
  }

  function draw() {
    if (!match) {
      body.innerHTML = '<div class="card"><p class="muted">Đang tải hoặc không tìm thấy trận.</p></div>';
      return;
    }
    body.innerHTML = `
      <section class="card">
        <h2>${esc(match.label)}</h2>
        <p>${esc(match.a?.name || '?')} vs ${esc(match.b?.name || '?')} · ${esc(courtName(settings.courts, match.court))} · ${esc(STATUS_LABEL[match.status] || match.status)}</p>
        <p>Tỷ số đang lưu: <b>${esc(scoreText(match) || 'chưa có')}</b>${match.walkoverReason ? ` · ${esc(match.walkoverReason)}` : ''}</p>
        ${(match.edits || []).length ? `<h3>Các lần sửa tỷ số</h3><ul class="list">${match.edits.map((x) => `
          <li class="list-item small">${esc(new Date(x.at).toLocaleString('vi-VN'))} · ${esc(x.byName || '')}: ${esc(x.from || '—')} → <b>${esc(x.to)}</b> · ${esc(x.reason)}</li>`).join('')}</ul>` : ''}
      </section>
      <section class="card">
        <h2>Sửa tỷ số (khi có khiếu nại)</h2>
        <form class="stack" id="edit-score">
          <label class="field"><span class="field-label">Tỷ số đúng, theo thứ tự ${esc(match.a?.name || 'A')} – ${esc(match.b?.name || 'B')}</span>
            <input name="games" placeholder="Ví dụ: 11-7 hoặc 11-7, 9-11, 11-5" value="${esc((match.games || []).map((g) => `${g.a}-${g.b}`).join(', '))}"></label>
          <label class="field"><span class="field-label">Lý do</span><input name="reason" required placeholder="Ví dụ: trọng tài bấm nhầm pha cuối"></label>
          <p class="note" id="edit-err" hidden></p>
          <button class="btn" type="submit">Lưu tỷ số mới</button>
        </form>
      </section>
      <section class="card">
        <h2>Từng pha (${rallies.length} dòng)</h2>
        ${rallies.length ? `<div class="table-wrap"><table class="rank audit"><thead><tr><th>#</th><th>Giờ</th><th>Sự kiện</th><th>Điểm sau đó</th><th>Người bấm</th></tr></thead>
          <tbody>${rows()}</tbody></table></div>` : '<p class="muted">Trận này chưa có pha nào được bấm.</p>'}
      </section>`;
  }

  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = body.querySelector('#edit-err');
    const parsed = parseGamesText(f.elements.games.value, settings.gamesPerMatch);
    if (parsed.error) { err.textContent = parsed.error; err.hidden = false; return; }
    const reason = f.elements.reason.value.trim();
    if (!reason) return;
    const edit = {
      at: new Date().toISOString(), by: session.user.uid, byName: session.user.name,
      from: scoreText(match), to: parsed.games.map((g) => `${g.a}–${g.b}`).join(', '), reason,
    };
    await save(() => fs.updateDoc(matchRef, {
      games: parsed.games,
      winner: parsed.winner,
      status: match.status === 'walkover' ? 'walkover' : 'done',
      edits: fs.arrayUnion(edit),
      updatedAt: fs.serverTimestamp(),
    }));
  });

  const unsubs = [
    watchEvent(fs, (ev) => { settings = withDefaults(ev?.settings); draw(); }),
    fs.onSnapshot(matchRef, (snap) => { match = snap.exists() ? { id: snap.id, ...snap.data() } : null; draw(); }),
    fs.onSnapshot(fs.query(fs.collection(fs.db, matchRef.path, 'rallies'), fs.orderBy('seq')), (snap) => {
      rallies = snap.docs.map((d) => d.data());
      draw();
    }),
  ];
  fs.getDocs(fs.collection(fs.db, 'roles')).then((snap) => {
    people = new Map([...people, ...snap.docs.map((d) => [d.id, d.data().name])]);
    draw();
  }).catch(() => {});
  draw();
  return () => unsubs.forEach((u) => u());
}
