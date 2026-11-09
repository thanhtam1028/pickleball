import { esc } from '../dom.js';
import { requireAdmin, eventDoc, sub, watchEvent, save, CLASSES } from '../data.js';
import { PRESETS, SCORING_FIELDS, withDefaults, estimateMinutes, resizeCourts } from '../core/settings.js';

const STAGE_LABELS = {
  warmup: 'Khởi động xoay cặp trộn lớp (không tính điểm lớp)',
  pool: 'Vòng bảng đan chéo (tính điểm lớp)',
  playoff: 'Bán kết và chung kết 4 cặp',
  clash: 'Trận siêu kinh điển kiểu MLP',
};
const POINT_LABELS = { pool: 'Thắng vòng bảng', semi: 'Thắng bán kết', final: 'Thắng chung kết', clash: 'Thắng siêu kinh điển' };

function field(label, help, control) {
  return `<label class="field"><span class="field-label">${label}</span>${control}<span class="field-help">${help}</span></label>`;
}

function formHtml(s, locked) {
  const dis = (name) => (locked && SCORING_FIELDS.includes(name) ? 'disabled' : '');
  const num = (name, value, min, max) =>
    `<input type="number" inputmode="numeric" name="${name}" value="${value ?? ''}" min="${min}" max="${max}" ${dis(name)}>`;

  return `
    <section class="card">
      <h2>Mẫu luật dựng sẵn</h2>
      <div class="preset-row">
        ${Object.entries(PRESETS).map(([key, p]) => `
          <button type="button" class="preset" data-preset="${key}" ${locked ? 'disabled' : ''}>
            <b>${esc(p.label)}</b><span>${esc(p.desc)}</span>
          </button>`).join('')}
      </div>
      ${locked ? '<p class="note">Giải đã có trận bắt đầu nên không đổi được luật tính điểm, để các trận được tính công bằng.</p>' : ''}
    </section>

    <section class="card form-grid">
      <h2>Luật tính điểm</h2>
      ${field('Cách tính điểm', '"Mỗi pha một điểm": ai thắng pha bóng thì được điểm. "Chỉ đội giao được điểm": cách truyền thống, đọc điểm 3 số.', `
        <select name="scoringMode" ${dis('scoringMode')}>
          <option value="rally" ${s.scoringMode === 'rally' ? 'selected' : ''}>Mỗi pha một điểm</option>
          <option value="sideout" ${s.scoringMode === 'sideout' ? 'selected' : ''}>Chỉ đội giao được điểm</option>
        </select>`)}
      ${field('Chơi tới mấy điểm', 'Thường là 11. Có thể chọn 15 hoặc 21.', num('pointsToWin', s.pointsToWin, 5, 21))}
      ${field('Phải hơn mấy điểm', 'Thường là 2: 11–10 thì đánh tiếp tới 12–10.', num('winBy', s.winBy, 1, 2))}
      ${field('Điểm tối đa', 'Tới điểm này ai chạm trước thắng, để trận không kéo dài. Để trống nếu không giới hạn.', num('pointCap', s.pointCap, 5, 30))}
      ${field('Số ván mỗi trận', '1 ván, hoặc thắng 2 trong 3 ván.', `
        <select name="gamesPerMatch" ${dis('gamesPerMatch')}>
          <option value="1" ${s.gamesPerMatch === 1 ? 'selected' : ''}>1 ván</option>
          <option value="3" ${s.gamesPerMatch === 3 ? 'selected' : ''}>Thắng 2 trong 3 ván</option>
        </select>`)}
      ${field('Số lần hội ý mỗi ván', 'Mỗi đội được xin dừng ngắn bao nhiêu lần.', num('timeoutsPerGame', s.timeoutsPerGame, 0, 3))}
      <label class="check">
        <input type="checkbox" name="rallyWinOnServeOnly" ${s.rallyWinOnServeOnly ? 'checked' : ''} ${dis('rallyWinOnServeOnly')}>
        <span>Điểm quyết định ván phải thắng khi đang giao bóng <small>(chỉ dùng với "Mỗi pha một điểm")</small></span>
      </label>
    </section>

    <section class="card form-grid">
      <h2>Thời gian và sân</h2>
      ${field('Giờ bắt đầu', '', `<input type="time" name="startTime" value="${esc(s.startTime)}">`)}
      ${field('Giờ kết thúc', 'Website dùng khung giờ này để tự tính số trận mỗi cặp.', `<input type="time" name="endTime" value="${esc(s.endTime)}">`)}
      ${field('Nghỉ giữa các phần (phút)', '', num('breakMinutes', s.breakMinutes, 0, 60))}
      ${field('Phút mỗi trận', `Để trống thì tự tính theo luật: hiện khoảng <b data-estimate>${estimateMinutes(s)}</b> phút.`, num('minutesPerMatch', s.minutesPerMatch, 5, 90))}
      ${field('Số sân', 'Đổi số sân rồi sửa tên từng sân nếu muốn.', `<input type="number" inputmode="numeric" name="courtCount" value="${s.courts.length}" min="1" max="20">`)}
      <div class="court-names">${s.courts.map((c, i) => `
        <input type="text" data-court="${i}" value="${esc(c.name)}" aria-label="Tên sân ${i + 1}">`).join('')}
      </div>
    </section>

    <section class="card form-grid">
      <h2>Các phần của giải</h2>
      ${Object.entries(STAGE_LABELS).map(([k, label]) => `
        <label class="check"><input type="checkbox" name="stage-${k}" ${s.stages[k] ? 'checked' : ''}><span>${label}</span></label>`).join('')}
      <h2 style="margin-top:12px">Điểm cộng cho lớp khi thắng</h2>
      ${Object.entries(POINT_LABELS).map(([k, label]) => field(label, '', num(`points-${k}`, s.classPoints[k], 0, 20))).join('')}
    </section>

    <div class="sticky-actions"><button class="btn" type="submit">Lưu cài đặt</button></div>`;
}

function readForm(form, courts) {
  const v = (n) => form.elements[n]?.value;
  const int = (n) => (v(n) === '' || v(n) == null ? null : Number(v(n)));
  return {
    scoringMode: v('scoringMode'),
    pointsToWin: int('pointsToWin') ?? 11,
    winBy: int('winBy') ?? 2,
    pointCap: int('pointCap'),
    gamesPerMatch: int('gamesPerMatch') ?? 1,
    timeoutsPerGame: int('timeoutsPerGame') ?? 2,
    rallyWinOnServeOnly: form.elements.rallyWinOnServeOnly.checked,
    startTime: v('startTime'),
    endTime: v('endTime'),
    breakMinutes: int('breakMinutes') ?? 0,
    minutesPerMatch: int('minutesPerMatch'),
    courts: courts.map((c, i) => ({ ...c, name: form.querySelector(`[data-court="${i}"]`)?.value.trim() || c.name })),
    stages: Object.fromEntries(Object.keys(STAGE_LABELS).map((k) => [k, form.elements[`stage-${k}`].checked])),
    classPoints: Object.fromEntries(Object.keys(POINT_LABELS).map((k) => [k, int(`points-${k}`) ?? 0])),
  };
}

function refereesHtml(referees, courts) {
  if (!referees.length) {
    return '<p class="muted">Chưa có trọng tài. Người làm trọng tài bấm Đăng nhập, rồi bạn duyệt họ ở trang <a href="#/phan-quyen">Phân quyền</a>.</p>';
  }
  const perCourt = Object.fromEntries(courts.map((c) => [c.id, referees.filter((r) => r.court === c.id).length]));
  const warnings = courts
    .filter((c) => perCourt[c.id] !== 1)
    .map((c) => `${esc(c.name)}: ${perCourt[c.id] === 0 ? 'chưa có trọng tài' : `${perCourt[c.id]} trọng tài`}`);
  return `
    ${warnings.length ? `<p class="note">${warnings.join(' · ')}</p>` : ''}
    <ul class="list">${referees.map((r) => `
      <li class="list-item">
        <span><b>${esc(r.name)}</b><br><span class="muted">${esc(r.email)}</span></span>
        <select data-referee="${esc(r.id)}" aria-label="Sân của ${esc(r.name)}">
          <option value="">Chưa phân sân</option>
          ${courts.map((c) => `<option value="${esc(c.id)}" ${r.court === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </li>`).join('')}</ul>`;
}

export function render(el, { session }) {
  el.innerHTML = '<h1>Cài đặt giải</h1>';
  const fs = requireAdmin(el, session);
  if (!fs) return null;

  const form = document.createElement('form');
  form.className = 'stack';
  const refCard = document.createElement('section');
  refCard.className = 'card';
  el.append(form, refCard);

  let settings = withDefaults();
  let courts = settings.courts;
  let locked = false;
  let referees = [];
  let dirty = false;

  const drawForm = () => {
    form.innerHTML = formHtml({ ...settings, courts }, locked);
  };
  const drawReferees = () => {
    refCard.innerHTML = `<h2>Trọng tài và sân</h2>${refereesHtml(referees, courts)}`;
  };

  form.addEventListener('input', (e) => {
    dirty = true;
    if (e.target.name === 'courtCount') {
      settings = { ...settings, ...readForm(form, courts) };
      courts = resizeCourts(settings.courts, e.target.value);
      drawForm();
      form.elements.courtCount.focus();
    }
    if (e.target.name === 'pointsToWin' || e.target.name === 'gamesPerMatch') {
      const est = form.querySelector('[data-estimate]');
      if (est) est.textContent = estimateMinutes(readForm(form, courts));
    }
  });

  form.addEventListener('click', (e) => {
    const key = e.target.closest('[data-preset]')?.dataset.preset;
    if (!key) return;
    settings = { ...settings, ...readForm(form, courts), ...PRESETS[key].values };
    dirty = true;
    drawForm();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const next = { ...settings, ...readForm(form, courts) };
    if (locked) SCORING_FIELDS.forEach((k) => { next[k] = settings[k]; });
    const ok = await save(() => fs.setDoc(eventDoc(fs), {
      name: 'Đại chiến CEO 110 – CEO 111',
      classes: CLASSES,
      settings: next,
    }, { merge: true }));
    if (ok) {
      dirty = false;
      const btn = form.querySelector('[type=submit]');
      btn.textContent = 'Đã lưu';
      setTimeout(() => { btn.textContent = 'Lưu cài đặt'; }, 1500);
    }
  });

  refCard.addEventListener('change', (e) => {
    const uid = e.target.dataset.referee;
    if (uid) save(() => fs.updateDoc(fs.doc(fs.db, 'roles', uid), { court: e.target.value || null }));
  });

  // Luật tính điểm bị khóa khi đã có trận đang đánh hoặc đã xong.
  fs.getDocs(fs.query(sub(fs, 'matches'), fs.where('status', 'in', ['live', 'done']), fs.limit(1)))
    .then((snap) => { locked = !snap.empty; if (!dirty) drawForm(); })
    .catch((err) => console.error(err));

  const unsubs = [
    watchEvent(fs, (event) => {
      if (dirty) return;
      settings = withDefaults(event?.settings);
      courts = settings.courts;
      drawForm();
      drawReferees();
    }),
    fs.onSnapshot(fs.query(fs.collection(fs.db, 'roles'), fs.where('role', '==', 'referee')), (snap) => {
      referees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      drawReferees();
    }),
  ];
  drawForm();
  drawReferees();
  return () => unsubs.forEach((u) => u());
}
