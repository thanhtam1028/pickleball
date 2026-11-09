import { esc } from '../dom.js';
import { requireAdmin, sub, subDoc, watchList, save, CLASSES, CROSS_CLASS } from '../data.js';
import { parsePlayerLines, autoPair, teamName, teamLevel, countSummary } from '../core/pairing.js';
import { SAMPLE_PLAYERS } from '../sample-data.js';

const genderLabel = (g) => ({ M: 'Nam', F: 'Nữ' }[g] || 'Chưa rõ giới tính');

export function render(el, { session }) {
  el.innerHTML = '<h1>Người chơi và cặp</h1>';
  const fs = requireAdmin(el, session);
  if (!fs) return null;

  let players = [];
  let teams = [];
  let cls = CLASSES[0];
  let search = '';
  const selected = new Set();

  el.insertAdjacentHTML('beforeend', `
    <div class="stack">
      <section class="card" id="summary"></section>
      <section class="card" id="sample"></section>
      <div class="segmented" role="tablist">
        ${CLASSES.map((c) => `<button role="tab" data-tab="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
      <section class="card">
        <details class="add-box">
          <summary>Thêm người chơi vào <b data-cls-label></b></summary>
          <p class="muted">Dán danh sách, mỗi dòng một người: <code>Tên, Nam/Nữ, trình độ 1–5</code>. Trình độ: 1 là mới chơi, 5 là chơi giỏi. Chỉ có tên cũng được: giới tính để "chưa rõ", trình độ là 3, sửa sau bằng cách bấm vào tên.</p>
          <textarea rows="6" id="paste" placeholder="Nguyễn Văn An, Nam, 3&#10;Trần Thị Bình, Nữ, 2"></textarea>
          <p class="note" id="paste-errors" hidden></p>
          <button class="btn" id="add-btn">Thêm vào danh sách</button>
        </details>
      </section>
      <section class="card">
        <div class="row-between">
          <h2>Người chơi</h2>
          <input type="search" id="search" placeholder="Tìm tên" aria-label="Tìm tên người chơi">
        </div>
        <ul class="list" id="player-list"></ul>
      </section>
      <section class="card">
        <h2>Ghép cặp</h2>
        <label class="check"><input type="checkbox" id="prefer-mixed"><span>Ưu tiên đôi nam nữ</span></label>
        <div class="btn-row">
          <button class="btn" id="auto-pair">Tự ghép những người chưa có cặp</button>
          <button class="btn btn-ghost" id="manual-pair" disabled>Ghép 2 người đã chọn</button>
        </div>
        <p class="muted small">Muốn ghép tay: tick ô vuông cạnh 2 người chưa có cặp trong danh sách ở trên.</p>
        <ul class="list" id="team-list"></ul>
      </section>
      <section class="card" id="cross"></section>
    </div>
    <dialog id="edit-dialog">
      <form method="dialog" class="stack" id="edit-form">
        <h2>Sửa người chơi</h2>
        <label class="field"><span class="field-label">Tên</span><input name="name" required></label>
        <label class="field"><span class="field-label">Giới tính</span>
          <select name="gender"><option value="">Chưa rõ</option><option value="M">Nam</option><option value="F">Nữ</option></select></label>
        <label class="field"><span class="field-label">Trình độ (1–5)</span><input name="level" type="number" min="1" max="5" inputmode="numeric"></label>
        <label class="field"><span class="field-label">Lớp</span>
          <select name="cls">${CLASSES.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
        <div class="btn-row">
          <button class="btn" value="save">Lưu</button>
          <button class="btn btn-ghost" value="cancel" formnovalidate>Hủy</button>
          <button class="btn btn-danger" value="delete" formnovalidate>Xóa người này</button>
        </div>
      </form>
    </dialog>`);

  const $ = (sel) => el.querySelector(sel);
  const dialog = $('#edit-dialog');
  let editingId = null;

  const teamOf = (playerId) => teams.find((t) => t.players.includes(playerId));
  const byId = (id) => players.find((p) => p.id === id);
  const checkInStarted = () => players.some((p) => p.checkedIn);

  // Xóa người chơi kéo theo xóa cặp của họ.
  function deletePlayers(batch, ids) {
    const idSet = new Set(ids);
    ids.forEach((id) => batch.delete(subDoc(fs, 'players', id)));
    teams.filter((t) => t.players.some((p) => idSet.has(p)))
      .forEach((t) => batch.delete(subDoc(fs, 'teams', t.id)));
  }

  function addTeam(batch, a, b, teamCls) {
    batch.set(fs.doc(sub(fs, 'teams')), {
      cls: teamCls,
      players: [a.id, b.id],
      name: teamName(a, b),
      sample: Boolean(a.sample || b.sample),
      createdAt: fs.serverTimestamp(),
    });
  }

  function addPlayers(list, sample) {
    const batch = fs.writeBatch(fs.db);
    list.forEach((p) => batch.set(fs.doc(sub(fs, 'players')), {
      ...p, checkedIn: false, ...(sample ? { sample: true } : {}), createdAt: fs.serverTimestamp(),
    }));
    return save(() => batch.commit());
  }

  function drawSummary() {
    const rows = countSummary(players, teams, CLASSES);
    const cross = teams.filter((t) => t.cls === CROSS_CLASS).length;
    $('#summary').innerHTML = `
      <h2>Tổng quan</h2>
      <div class="stat-grid">${rows.map((r) => `
        <div class="stat ${r.cls === CLASSES[0] ? 'c110' : 'c111'}">
          <b>${esc(r.cls)}</b>
          <span>${r.total} người · ${r.male} nam · ${r.female} nữ${r.unknownGender ? ` · <em>${r.unknownGender} chưa rõ giới tính</em>` : ''}</span>
          <span>${r.teams} cặp${r.unpaired ? ` · <em>${r.unpaired} chưa có cặp</em>` : ''}</span>
          <span>Đã đến ${r.checkedIn}/${r.total}</span>
        </div>`).join('')}
      </div>
      ${cross ? `<p class="muted small">${cross} cặp liên lớp (không tính điểm cho lớp).</p>` : ''}`;
  }

  function drawSample() {
    const sampleCount = players.filter((p) => p.sample).length;
    $('#sample').innerHTML = sampleCount
      ? `<h2>Dữ liệu mẫu</h2>
         <p class="muted">Đang có ${sampleCount} người chơi mẫu (gắn nhãn "mẫu"). Khi có danh sách thật, bấm nút dưới để xóa họ và các cặp của họ, rồi dán danh sách thật.</p>
         <button class="btn btn-danger" id="clear-sample">Xóa dữ liệu mẫu</button>`
      : `<h2>Dữ liệu mẫu</h2>
         <p class="muted">Chưa có danh sách thật? Nạp 16 người chơi mẫu (8 mỗi lớp) để thử ghép cặp và xếp lịch. Xóa được bất cứ lúc nào.</p>
         <button class="btn btn-ghost" id="load-sample">Nạp dữ liệu mẫu</button>`;
  }

  function drawPlayers() {
    const q = search.trim().toLowerCase();
    const list = players
      .filter((p) => p.cls === cls && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    $('#player-list').innerHTML = list.length ? list.map((p) => {
      const team = teamOf(p.id);
      return `
      <li class="player-row">
        ${team ? '<span class="pick-spacer"></span>' : `<input type="checkbox" class="pick" data-pick="${esc(p.id)}" ${selected.has(p.id) ? 'checked' : ''} aria-label="Chọn ${esc(p.name)} để ghép tay">`}
        <button class="player-main" data-edit="${esc(p.id)}">
          <b>${esc(p.name)}</b>
          <span class="muted">${genderLabel(p.gender)} · trình độ ${p.level}${team ? ` · cặp ${esc(team.name)}` : ''}</span>
          ${p.sample ? '<span class="pill">mẫu</span>' : ''}
        </button>
        <button class="checkin ${p.checkedIn ? 'on' : ''}" data-checkin="${esc(p.id)}" aria-pressed="${Boolean(p.checkedIn)}">
          ${p.checkedIn ? 'Đã đến' : 'Chưa đến'}
        </button>
      </li>`;
    }).join('') : `<p class="muted">${q ? 'Không tìm thấy.' : 'Lớp này chưa có ai. Dán danh sách ở trên hoặc nạp dữ liệu mẫu.'}</p>`;
    $('#manual-pair').disabled = selected.size !== 2;
  }

  function teamRow(t) {
    const members = t.players.map(byId).filter(Boolean);
    const absent = checkInStarted() && members.some((m) => !m.checkedIn);
    return `
      <li class="list-item ${absent ? 'warn-row' : ''}">
        <span><b>${esc(t.name)}</b>${t.sample ? ' <span class="pill">mẫu</span>' : ''}<br>
          <span class="muted">${members.map((m) => esc(m.name)).join(' + ')} · tổng trình độ ${teamLevel(members)}</span>
          ${absent ? '<br><span class="warn-text">Có người chưa đến: đổi người hoặc rút cặp</span>' : ''}
        </span>
        <span class="btn-row nowrap">
          <button class="btn btn-ghost btn-small" data-rename="${esc(t.id)}">Đổi tên</button>
          <button class="btn btn-ghost btn-small" data-unpair="${esc(t.id)}">Rút cặp</button>
        </span>
      </li>`;
  }

  function drawTeams() {
    const list = teams.filter((t) => t.cls === cls);
    $('#team-list').innerHTML = list.length ? list.map(teamRow).join('') : '<p class="muted">Chưa có cặp nào.</p>';
  }

  function drawCross() {
    const paired = new Set(teams.flatMap((t) => t.players));
    const lone = CLASSES.map((c) => players.filter((p) => p.cls === c && !paired.has(p.id)));
    const crossTeams = teams.filter((t) => t.cls === CROSS_CLASS);
    const canCross = lone.every((l) => l.length >= 1) && lone.some((l) => l.length === 1);
    $('#cross').hidden = !canCross && !crossTeams.length;
    $('#cross').innerHTML = `
      <h2>Cặp liên lớp</h2>
      ${canCross ? `<p class="muted">Mỗi lớp còn người chưa có cặp: ${lone.map((l, i) => `${esc(CLASSES[i])}: ${l.map((p) => esc(p.name)).join(', ')}`).join(' · ')}.
        Ghép họ thành một cặp liên lớp để ai cũng được chơi; cặp này không tính điểm cho lớp.</p>
        <button class="btn btn-ghost" id="pair-cross">Ghép cặp liên lớp</button>` : ''}
      <ul class="list">${crossTeams.map(teamRow).join('')}</ul>`;
  }

  function drawAll() {
    el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === cls)));
    el.querySelector('[data-cls-label]').textContent = cls;
    drawSummary();
    drawSample();
    drawPlayers();
    drawTeams();
    drawCross();
  }

  el.addEventListener('input', (e) => {
    if (e.target.id === 'search') {
      search = e.target.value;
      drawPlayers();
    }
  });

  el.addEventListener('change', (e) => {
    const id = e.target.dataset.pick;
    if (!id) return;
    if (e.target.checked) selected.add(id); else selected.delete(id);
    if (selected.size > 2) {
      selected.delete(id);
      e.target.checked = false;
    }
    $('#manual-pair').disabled = selected.size !== 2;
  });

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t || t.closest('dialog')) return;

    if (t.dataset.tab) {
      cls = t.dataset.tab;
      selected.clear();
      drawAll();
    } else if (t.id === 'add-btn') {
      const { players: list, errors } = parsePlayerLines($('#paste').value, cls);
      const errBox = $('#paste-errors');
      errBox.hidden = !errors.length;
      errBox.innerHTML = errors.map(esc).join('<br>');
      if (list.length && await addPlayers(list, false)) $('#paste').value = '';
    } else if (t.id === 'load-sample') {
      // Chỉ nạp mẫu cho lớp chưa có ai, để không trộn người mẫu vào danh sách thật.
      const empty = CLASSES.filter((c) => !players.some((p) => p.cls === c));
      if (!empty.length) {
        alert('Cả hai lớp đã có người chơi nên không nạp dữ liệu mẫu.');
        return;
      }
      await addPlayers(empty.flatMap((c) => parsePlayerLines(SAMPLE_PLAYERS[c], c).players), true);
    } else if (t.id === 'clear-sample') {
      if (!confirm('Xóa tất cả người chơi mẫu và các cặp của họ?')) return;
      const batch = fs.writeBatch(fs.db);
      deletePlayers(batch, players.filter((p) => p.sample).map((p) => p.id));
      await save(() => batch.commit());
    } else if (t.dataset.checkin) {
      const p = byId(t.dataset.checkin);
      await save(() => fs.updateDoc(subDoc(fs, 'players', p.id), { checkedIn: !p.checkedIn }));
    } else if (t.dataset.edit) {
      const p = byId(t.dataset.edit);
      editingId = p.id;
      const f = $('#edit-form');
      f.elements.name.value = p.name;
      f.elements.gender.value = p.gender || '';
      f.elements.level.value = p.level;
      f.elements.cls.value = p.cls;
      dialog.showModal();
    } else if (t.id === 'auto-pair') {
      const paired = new Set(teams.flatMap((x) => x.players));
      const pool = players.filter((p) => p.cls === cls && !paired.has(p.id));
      const { teams: made, leftover } = autoPair(pool, { preferMixed: $('#prefer-mixed').checked });
      if (!made.length) {
        alert('Không còn đủ 2 người chưa có cặp trong lớp này.');
        return;
      }
      const batch = fs.writeBatch(fs.db);
      made.forEach(([a, b]) => addTeam(batch, a, b, cls));
      if (await save(() => batch.commit()) && leftover.length) {
        alert(`${cls} còn 1 người chưa có cặp: ${leftover[0].name}. Xem mục "Cặp liên lớp" bên dưới.`);
      }
    } else if (t.id === 'manual-pair') {
      const [a, b] = [...selected].map(byId);
      const batch = fs.writeBatch(fs.db);
      addTeam(batch, a, b, a.cls === b.cls ? a.cls : CROSS_CLASS);
      selected.clear();
      await save(() => batch.commit());
    } else if (t.id === 'pair-cross') {
      const paired = new Set(teams.flatMap((x) => x.players));
      const [a, b] = CLASSES.map((c) => players.find((p) => p.cls === c && !paired.has(p.id)));
      const batch = fs.writeBatch(fs.db);
      addTeam(batch, a, b, CROSS_CLASS);
      await save(() => batch.commit());
    } else if (t.dataset.unpair) {
      if (confirm('Rút cặp này? Hai người sẽ trở về danh sách chưa có cặp.')) {
        await save(() => fs.deleteDoc(subDoc(fs, 'teams', t.dataset.unpair)));
      }
    } else if (t.dataset.rename) {
      const team = teams.find((x) => x.id === t.dataset.rename);
      const name = prompt('Tên cặp', team.name)?.trim();
      if (name) await save(() => fs.updateDoc(subDoc(fs, 'teams', team.id), { name }));
    }
  });

  dialog.addEventListener('close', async () => {
    const f = $('#edit-form');
    const p = byId(editingId);
    if (!p) return;
    const batch = fs.writeBatch(fs.db);
    if (dialog.returnValue === 'delete') {
      if (!confirm(`Xóa ${p.name}? Cặp của người này cũng bị rút.`)) return;
      deletePlayers(batch, [p.id]);
    } else if (dialog.returnValue === 'save') {
      const next = {
        name: f.elements.name.value.trim() || p.name,
        gender: f.elements.gender.value || null,
        level: Math.min(5, Math.max(1, Number(f.elements.level.value) || 3)),
        cls: f.elements.cls.value,
      };
      batch.update(subDoc(fs, 'players', p.id), next);
      const team = teamOf(p.id);
      if (team && next.cls !== p.cls) batch.delete(subDoc(fs, 'teams', team.id));
    } else {
      return;
    }
    await save(() => batch.commit());
  });

  const unsubs = [
    watchList(fs, 'players', (list) => {
      players = list;
      [...selected].forEach((id) => { if (!byId(id) || teamOf(id)) selected.delete(id); });
      drawAll();
    }),
    watchList(fs, 'teams', (list) => { teams = list; drawAll(); }),
  ];
  drawAll();
  return () => unsubs.forEach((u) => u());
}
