import { esc } from '../dom.js';
import { requireAdmin, sub, subDoc, watchList, watchEvent, save, eventDoc, CLASSES, CROSS_CLASS } from '../data.js';
import { withDefaults, minutesPerMatch, SCORING_FIELDS } from '../core/settings.js';
import { countSummary } from '../core/pairing.js';
import { mixerRounds, crossClassPool, assignCourts, suggestFormat, suggestNext, teamSide } from '../core/scheduler.js';
import { singleElimination, teamClash } from '../core/bracket.js';
import { rankTeams } from '../core/standings.js';
import { toMin, fmtMin } from '../core/time.js';
import {
  STAGES, STATUS_LABEL, stageGroup, isFinished, isOnCourt, courtName, sideLabel, srcLabel, scoreText, sortMatches, lastEnd,
} from '../match-format.js';

const PLAYOFF_SIZES = [2, 4, 8];

export function render(el, { session }) {
  el.innerHTML = '<h1>Xếp lịch và điều hành sân</h1>';
  const fs = requireAdmin(el, session);
  if (!fs) return null;

  let settings = withDefaults();
  let drawOrder = {};
  let players = [];
  let teams = [];
  let matches = [];
  const ui = { stage: 'pool', warmupRounds: 2, perTeam: 3, playoffTeams: 4, lineup: {}, preview: null, previewNote: '' };
  const swapPick = new Set();

  el.insertAdjacentHTML('beforeend', `
    <div class="stack">
      <section class="card" id="assistant"></section>
      <section class="card" id="courts"></section>
      <section class="card" id="builder"></section>
      <section class="card" id="all-matches"></section>
    </div>
    <dialog id="match-dialog"><form method="dialog" class="stack" id="match-form"></form></dialog>`);
  const $ = (s) => el.querySelector(s);
  const dialog = $('#match-dialog');
  let dialogMatch = null;

  const minutes = () => minutesPerMatch(settings);
  const courts = () => settings.courts;
  const presentPlayers = () => (players.some((p) => p.checkedIn) ? players.filter((p) => p.checkedIn) : players);
  const stageMatches = (group) => matches.filter((m) => stageGroup(m.stage) === group);
  const playerName = (id) => players.find((p) => p.id === id)?.name || '?';

  // ---------- Trợ lý thể thức ----------
  function suggestion() {
    const sum = countSummary(players, teams, CLASSES);
    return suggestFormat({
      teamCounts: [...sum.map((r) => r.teams), teams.filter((t) => t.cls === CROSS_CLASS).length],
      genderCounts: sum.map((r) => ({ male: r.male, female: r.female })),
      playerCounts: sum.map((r) => r.total),
      courtCount: courts().length,
      settings,
    });
  }

  function drawAssistant() {
    const s = suggestion();
    const sum = countSummary(players, teams, CLASSES);
    const counts = sum.map((r) => `${esc(r.cls)}: ${r.total} người, ${r.teams} cặp`).join(' · ');
    const head = `<h2>Trợ lý thể thức</h2>
      <p class="muted small">${counts} · ${courts().length} sân · ${esc(settings.startTime)}–${esc(settings.endTime)}</p>`;
    if (!s.fits) {
      $('#assistant').innerHTML = `${head}<p class="note">${s.reasons.map(esc).join('<br>')}</p>`;
      return;
    }
    const parts = [
      s.warmupRounds ? `khởi động ${s.warmupRounds} vòng` : null,
      `vòng bảng mỗi cặp ${s.matchesPerTeam} trận`,
      `ván tới ${s.pointsToWin} điểm (khoảng ${s.minutesPerMatch} phút/trận)`,
      s.playoffTeams === 4 ? 'bán kết và chung kết 4 cặp' : s.playoffTeams === 2 ? 'chung kết 2 cặp' : null,
      s.clash ? 'trận siêu kinh điển' : null,
    ].filter(Boolean);
    $('#assistant').innerHTML = `${head}
      <p class="suggest">Đề xuất: ${parts.join(', ')}. Kết thúc dự kiến <b>${esc(s.endTime)}</b>.</p>
      ${s.reasons.length ? `<p class="muted small">${s.reasons.map(esc).join('<br>')}</p>` : ''}
      <button class="btn" data-act="use-suggestion">Dùng đề xuất này</button>`;
  }

  async function useSuggestion() {
    const s = suggestion();
    if (!s.fits) return;
    const locked = matches.some((m) => isOnCourt(m) || isFinished(m));
    const next = { ...settings, stages: { ...settings.stages, warmup: s.warmupRounds > 0, playoff: s.playoffTeams > 0, clash: s.clash } };
    if (!locked) next.pointsToWin = s.pointsToWin;
    else SCORING_FIELDS.forEach((k) => { next[k] = settings[k]; });
    Object.assign(ui, { warmupRounds: s.warmupRounds || ui.warmupRounds, perTeam: s.matchesPerTeam, playoffTeams: s.playoffTeams || ui.playoffTeams });
    await save(() => fs.setDoc(eventDoc(fs), {
      settings: next,
      plan: { warmupRounds: s.warmupRounds, matchesPerTeam: s.matchesPerTeam, playoffTeams: s.playoffTeams, clash: s.clash },
    }, { merge: true }));
  }

  // ---------- Tạo lịch ----------
  function lineupPicker(cls) {
    const list = presentPlayers().filter((p) => p.cls === cls);
    const sel = (role, i, gender) => `
      <select data-lineup="${esc(cls)}|${role}|${i}" aria-label="${esc(cls)} ${role === 'men' ? 'nam' : 'nữ'} ${i + 1}">
        <option value="">Chọn ${gender === 'M' ? 'nam' : 'nữ'} ${i + 1}</option>
        ${list.filter((p) => p.gender === gender).map((p) => `<option value="${esc(p.id)}" ${ui.lineup[cls]?.[role]?.[i] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>`;
    return `<div class="lineup"><b>${esc(cls)}</b>${sel('men', 0, 'M')}${sel('men', 1, 'M')}${sel('women', 0, 'F')}${sel('women', 1, 'F')}</div>`;
  }

  function stageForm() {
    const existing = stageMatches(ui.stage);
    if (existing.length) {
      const busy = existing.some((m) => isOnCourt(m) || isFinished(m));
      return `<p>Phần này đã có <b>${existing.length} trận</b> trong lịch.</p>
        ${busy ? '<p class="muted small">Đã có trận đang đánh hoặc đã xong nên không xóa lịch phần này được. Sửa từng trận ở danh sách bên dưới.</p>'
          : '<button class="btn btn-danger" data-act="clear-stage">Xóa lịch phần này để tạo lại</button>'}`;
    }
    if (ui.stage === 'warmup') {
      return `<p class="muted small">Mỗi đội gồm 1 người CEO 110 và 1 người CEO 111, đổi đồng đội mỗi vòng. Không tính điểm cho lớp.</p>
        <label class="field"><span class="field-label">Số vòng</span><input type="number" min="1" max="6" data-ui="warmupRounds" value="${ui.warmupRounds}"></label>`;
    }
    if (ui.stage === 'pool') {
      return `<p class="muted small">Mỗi cặp đấu với các cặp của lớp kia. Thắng thì cộng ${settings.classPoints.pool} điểm cho lớp.</p>
        <label class="field"><span class="field-label">Số trận mỗi cặp</span><input type="number" min="1" max="8" data-ui="perTeam" value="${ui.perTeam}"></label>`;
    }
    if (ui.stage === 'playoff') {
      const pool = stageMatches('pool');
      const left = pool.filter((m) => !isFinished(m)).length;
      if (!pool.length) return '<p class="muted">Cần có lịch vòng bảng trước.</p>';
      if (left) return `<p class="muted">Còn ${left} trận vòng bảng chưa xong. Khi xong hết, website lấy các cặp đứng đầu bảng xếp hạng để vào chung kết.</p>`;
      return `<label class="field"><span class="field-label">Số cặp vào vòng chung kết</span>
        <select data-ui="playoffTeams">${PLAYOFF_SIZES.filter((n) => n <= teams.length).map((n) => `<option ${n === ui.playoffTeams ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
    }
    return `<p class="muted small">Chọn đội hình mỗi lớp: 2 nam và 2 nữ. Website xếp 4 trận: đôi nam, đôi nữ, 2 trận đôi nam nữ. Hòa 2–2 thì tự thêm trận phân định.</p>
      <div class="lineup-grid">${CLASSES.map(lineupPicker).join('')}</div>`;
  }

  function previewHtml() {
    if (!ui.preview) return '';
    if (!ui.preview.matches.length) return `<p class="note">${esc(ui.previewNote || 'Không tạo được trận nào.')}</p>`;
    return `
      <div class="preview">
        <p><b>${ui.preview.matches.length} trận</b>, ${ui.preview.slots} khung giờ, kết thúc dự kiến <b>${fmtMin(ui.preview.endMin)}</b>
          ${toMin(settings.endTime) < ui.preview.endMin ? `<span class="warn-text">(trễ hơn giờ kết thúc ${esc(settings.endTime)})</span>` : ''}</p>
        ${ui.previewNote ? `<p class="muted small">${esc(ui.previewNote)}</p>` : ''}
        ${matchTable(ui.preview.matches, false)}
        <div class="btn-row"><button class="btn" data-act="commit">Chốt lịch</button><button class="btn btn-ghost" data-act="discard">Bỏ</button></div>
      </div>`;
  }

  function drawBuilder() {
    $('#builder').innerHTML = `
      <h2>Tạo lịch</h2>
      <div class="segmented four" role="tablist">
        ${STAGES.map((s) => `<button role="tab" data-stage="${s.id}" aria-selected="${s.id === ui.stage}">${s.label}</button>`).join('')}
      </div>
      <div class="stack" style="margin-top:12px">
        ${stageForm()}
        ${!stageMatches(ui.stage).length && !ui.preview ? '<button class="btn" data-act="preview">Xem trước</button>' : ''}
        ${previewHtml()}
      </div>`;
  }

  function buildSpecs() {
    const p110 = presentPlayers().filter((p) => p.cls === CLASSES[0]);
    const p111 = presentPlayers().filter((p) => p.cls === CLASSES[1]);
    if (ui.stage === 'warmup') {
      const specs = mixerRounds(p110, p111, ui.warmupRounds, courts().length, Date.now() % 100000);
      return { specs, note: specs.length ? '' : 'Mỗi lớp cần ít nhất 2 người.' };
    }
    if (ui.stage === 'pool') {
      const byCls = (c) => teams.filter((t) => t.cls === c);
      const { matches: specs, short } = crossClassPool(byCls(CLASSES[0]), byCls(CLASSES[1]), ui.perTeam, byCls(CROSS_CLASS));
      const note = !specs.length ? 'Mỗi lớp cần có cặp. Vào trang Người chơi để ghép cặp.'
        : short.length ? `Không xếp đủ ${ui.perTeam} trận cho: ${short.join(', ')}.` : '';
      return { specs, note };
    }
    if (ui.stage === 'playoff') {
      const ranked = rankTeams(matches, teams, ['pool'], drawOrder).slice(0, ui.playoffTeams);
      const seeds = ranked.map((r) => teamSide(teams.find((t) => t.id === r.id)));
      return { specs: singleElimination(seeds), note: `Hạt giống: ${ranked.map((r, i) => `${i + 1}. ${r.name}`).join(', ')}` };
    }
    const lineupOf = (cls) => {
      const l = ui.lineup[cls] || {};
      const pick = (ids) => (ids || []).map((id) => players.find((p) => p.id === id)).filter(Boolean);
      return { men: pick(l.men), women: pick(l.women) };
    };
    const [l1, l2] = CLASSES.map(lineupOf);
    const complete = [l1, l2].every((l) => l.men.length === 2 && l.women.length === 2 && new Set([...l.men, ...l.women]).size === 4);
    if (!complete) return { specs: [], note: 'Mỗi lớp chọn đủ 2 nam và 2 nữ khác nhau.' };
    return { specs: teamClash(CLASSES[0], l1, CLASSES[1], l2), note: '' };
  }

  function makePreview() {
    const { specs, note } = buildSpecs();
    const start = matches.length ? lastEnd(matches, minutes()) + settings.breakMinutes : toMin(settings.startTime);
    const offset = matches.length ? Math.max(...matches.map((m) => m.slot ?? 0)) + 1 : 0;
    ui.preview = assignCourts(specs, courts(), minutes(), start, offset);
    ui.previewNote = note;
  }

  async function commitPreview() {
    const batch = fs.writeBatch(fs.db);
    ui.preview.matches.forEach((m) => batch.set(fs.doc(sub(fs, 'matches')), {
      ...m, status: 'scheduled', games: [], winner: null, createdAt: fs.serverTimestamp(),
    }));
    if (await save(() => batch.commit())) ui.preview = null;
    drawBuilder();
  }

  async function clearStage() {
    const list = stageMatches(ui.stage);
    if (!confirm(`Xóa ${list.length} trận của phần này?`)) return;
    const batch = fs.writeBatch(fs.db);
    list.forEach((m) => batch.delete(subDoc(fs, 'matches', m.id)));
    await save(() => batch.commit());
  }

  // ---------- Điều hành sân ----------
  function drawCourts() {
    if (!matches.length) {
      $('#courts').innerHTML = '<h2>Điều hành sân</h2><p class="muted">Chưa có lịch. Tạo lịch ở phần bên dưới.</p>';
      return;
    }
    $('#courts').innerHTML = `<h2>Điều hành sân</h2>
      <div class="court-grid">${courts().map((c) => {
        const current = matches.find((m) => isOnCourt(m) && m.court === c.id);
        const next = current ? null : suggestNext(matches, c.id);
        return `<div class="court-card">
          <b>${esc(c.name)}</b>
          ${current ? `
            <span class="pill ${current.status === 'live' ? 'live' : ''}">${STATUS_LABEL[current.status]}</span>
            <span>${esc(current.label)}: ${sideLabel(current.a)} vs ${sideLabel(current.b)}</span>
            ${current.status === 'called' ? `<button class="btn btn-ghost btn-small" data-uncall="${esc(current.id)}">Bỏ gọi</button>` : ''}`
          : next ? `
            <span class="muted small">Sân trống. Trận đề xuất:</span>
            <span>${esc(next.label)}: ${sideLabel(next.a)} vs ${sideLabel(next.b)} <span class="muted small">(lịch ${esc(next.startAt)})</span></span>
            <button class="btn btn-small" data-call="${esc(next.id)}" data-court="${esc(c.id)}">Gọi trận này</button>`
          : '<span class="muted small">Sân trống, không còn trận chờ.</span>'}
        </div>`;
      }).join('')}</div>`;
  }

  // ---------- Danh sách trận ----------
  function matchTable(list, editable) {
    return `<ul class="list match-list">${sortMatches(list).map((m) => `
      <li class="match-row status-${m.status || 'preview'}">
        ${editable && m.status === 'scheduled' ? `<input type="checkbox" class="pick" data-swap="${esc(m.id)}" ${swapPick.has(m.id) ? 'checked' : ''} aria-label="Chọn để hoán đổi">` : '<span class="pick-spacer"></span>'}
        <span class="match-time"><b>${esc(m.startAt)}</b><span class="muted small">${esc(courtName(courts(), m.court))}</span></span>
        <span class="match-body">
          <span class="muted small">${esc(m.label)}${!m.countsForClass && ['pool', 'warmup'].includes(m.stage) ? ' · không tính điểm lớp' : ''}</span>
          <span>${sideLabel(m.a, srcLabel(m.srcA))} <span class="muted">vs</span> ${sideLabel(m.b, srcLabel(m.srcB))}</span>
          ${m.status ? `<span class="small">${STATUS_LABEL[m.status]}${scoreText(m) ? ` · ${esc(scoreText(m))}` : ''}${m.walkoverReason ? ` · ${esc(m.walkoverReason)}` : ''}</span>` : ''}
        </span>
        ${editable && !isFinished(m) && m.status !== 'live' ? `<button class="btn btn-ghost btn-small" data-edit-match="${esc(m.id)}">Sửa</button>` : ''}
        ${editable && (isFinished(m) || m.status === 'live') ? `<a class="btn btn-ghost btn-small" href="#/nhat-ky/${esc(m.id)}">Nhật ký</a>` : ''}
      </li>`).join('')}</ul>`;
  }

  function drawAll() {
    $('#all-matches').innerHTML = `
      <div class="row-between"><h2>Toàn bộ lịch</h2>
        <button class="btn btn-ghost btn-small" data-act="swap" ${swapPick.size === 2 ? '' : 'disabled'}>Hoán đổi giờ và sân của 2 trận đã chọn</button></div>
      ${matches.length ? STAGES.map((s) => {
        const list = stageMatches(s.id);
        return list.length ? `<h3>${esc(s.label)}</h3>${matchTable(list, true)}` : '';
      }).join('') : '<p class="muted">Chưa có trận nào.</p>'}`;
  }

  function openMatchDialog(m) {
    dialogMatch = m;
    $('#match-form').innerHTML = `
      <h2>${esc(m.label)}</h2>
      <p>${sideLabel(m.a, srcLabel(m.srcA))} vs ${sideLabel(m.b, srcLabel(m.srcB))}</p>
      <label class="field"><span class="field-label">Sân</span>
        <select name="court">${courts().map((c) => `<option value="${esc(c.id)}" ${c.id === m.court ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field"><span class="field-label">Giờ</span><input type="time" name="startAt" value="${esc(m.startAt)}"></label>
      ${m.a && m.b ? `
        <fieldset class="field walkover"><legend class="field-label">Xử thua (một bên vắng hoặc bỏ cuộc)</legend>
          <label class="check"><input type="radio" name="wo" value="" checked><span>Không</span></label>
          <label class="check"><input type="radio" name="wo" value="A"><span>${esc(m.a.name)} thắng</span></label>
          <label class="check"><input type="radio" name="wo" value="B"><span>${esc(m.b.name)} thắng</span></label>
          <input name="reason" placeholder="Lý do, ví dụ: cặp kia vắng mặt">
        </fieldset>` : ''}
      <div class="btn-row"><button class="btn" value="save">Lưu</button><button class="btn btn-ghost" value="cancel" formnovalidate>Hủy</button></div>`;
    dialog.showModal();
  }

  dialog.addEventListener('close', async () => {
    if (dialog.returnValue !== 'save' || !dialogMatch) return;
    const f = $('#match-form');
    const patch = { court: f.elements.court.value, startAt: f.elements.startAt.value || dialogMatch.startAt };
    const wo = f.elements.wo?.value;
    if (wo) {
      const pts = settings.pointsToWin;
      Object.assign(patch, {
        status: 'walkover',
        winner: wo,
        games: [wo === 'A' ? { a: pts, b: 0 } : { a: 0, b: pts }],
        walkoverReason: f.elements.reason.value.trim() || 'Xử thua',
      });
    }
    await save(() => fs.updateDoc(subDoc(fs, 'matches', dialogMatch.id), patch));
  });

  // ---------- Sự kiện ----------
  el.addEventListener('input', (e) => {
    const key = e.target.dataset.ui;
    if (key) ui[key] = Number(e.target.value);
  });

  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.ui) ui[t.dataset.ui] = Number(t.value);
    if (t.dataset.lineup) {
      const [cls, role, i] = t.dataset.lineup.split('|');
      ui.lineup[cls] = ui.lineup[cls] || { men: [], women: [] };
      ui.lineup[cls][role][Number(i)] = t.value;
    }
    if (t.dataset.swap) {
      if (t.checked) swapPick.add(t.dataset.swap); else swapPick.delete(t.dataset.swap);
      if (swapPick.size > 2) { swapPick.delete(t.dataset.swap); t.checked = false; }
      const btn = el.querySelector('[data-act="swap"]');
      if (btn) btn.disabled = swapPick.size !== 2;
    }
  });

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t || t.closest('dialog')) return;
    const act = t.dataset.act;
    if (t.dataset.stage) {
      ui.stage = t.dataset.stage;
      ui.preview = null;
      drawBuilder();
    } else if (act === 'use-suggestion') {
      await useSuggestion();
    } else if (act === 'preview') {
      makePreview();
      drawBuilder();
    } else if (act === 'discard') {
      ui.preview = null;
      drawBuilder();
    } else if (act === 'commit') {
      await commitPreview();
    } else if (act === 'clear-stage') {
      await clearStage();
    } else if (act === 'swap') {
      const [x, y] = [...swapPick].map((id) => matches.find((m) => m.id === id));
      const batch = fs.writeBatch(fs.db);
      batch.update(subDoc(fs, 'matches', x.id), { court: y.court, startAt: y.startAt, slot: y.slot });
      batch.update(subDoc(fs, 'matches', y.id), { court: x.court, startAt: x.startAt, slot: x.slot });
      swapPick.clear();
      await save(() => batch.commit());
    } else if (t.dataset.call) {
      await save(() => fs.updateDoc(subDoc(fs, 'matches', t.dataset.call), { status: 'called', court: t.dataset.court }));
    } else if (t.dataset.uncall) {
      await save(() => fs.updateDoc(subDoc(fs, 'matches', t.dataset.uncall), { status: 'scheduled' }));
    } else if (t.dataset.editMatch) {
      openMatchDialog(matches.find((m) => m.id === t.dataset.editMatch));
    }
  });

  const redraw = () => {
    drawAssistant();
    drawCourts();
    drawBuilder();
    drawAll();
  };

  const unsubs = [
    watchEvent(fs, (ev) => {
      settings = withDefaults(ev?.settings);
      drawOrder = ev?.drawOrder || {};
      if (ev?.plan) {
        ui.warmupRounds = ev.plan.warmupRounds || ui.warmupRounds;
        ui.perTeam = ev.plan.matchesPerTeam || ui.perTeam;
        ui.playoffTeams = ev.plan.playoffTeams || ui.playoffTeams;
      }
      redraw();
    }),
    watchList(fs, 'players', (list) => { players = list; redraw(); }),
    watchList(fs, 'teams', (list) => { teams = list; redraw(); }),
    watchList(fs, 'matches', (list) => {
      matches = list;
      [...swapPick].forEach((id) => { if (!matches.some((m) => m.id === id && m.status === 'scheduled')) swapPick.delete(id); });
      redraw();
    }),
  ];
  redraw();
  return () => unsubs.forEach((u) => u());
}
