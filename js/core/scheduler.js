// Bộ xếp lịch: tạo danh sách trận cho từng phần của giải, xếp vào sân và khung giờ, và đề xuất thể thức.
// Hàm thuần, không đụng Firebase. Một "bên" (side) của trận là { players: [mã người chơi], name, cls, teamId? }.
import { teamName, CROSS_CLASS } from './pairing.js';
import { estimateMinutes } from './settings.js';
import { toMin, fmtMin } from './time.js';

// Bộ sinh số ngẫu nhiên có hạt giống, để cùng dữ liệu thì cho cùng lịch (dễ test, dễ xem lại).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pairKey = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);

export const teamSide = (t) => ({ teamId: t.id, players: t.players, name: t.name, cls: t.cls });

const countsForClass = (a, b) => a.cls !== b.cls && a.cls !== CROSS_CLASS && b.cls !== CROSS_CLASS;

// Khởi động xoay cặp: mỗi đội gồm 1 người mỗi lớp, hạn chế lặp lại đồng đội và đối thủ,
// người dư ngồi nghỉ luân phiên (ai chơi ít hơn thì được vào sân trước).
export function mixerRounds(players110, players111, rounds, courtCount, seed = 1) {
  const rng = mulberry32(seed);
  const perRound = Math.min(courtCount, Math.floor(players110.length / 2), Math.floor(players111.length / 2));
  if (perRound < 1) return [];
  const played = new Map();
  const partners = new Set();
  const opponents = new Set();
  const matches = [];

  const pick = (list) => shuffle(list, rng)
    .sort((x, y) => (played.get(x.id) || 0) - (played.get(y.id) || 0))
    .slice(0, perRound * 2);

  for (let r = 0; r < rounds; r++) {
    const a = pick(players110);
    const b = pick(players111);
    let best = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const bb = attempt === 0 ? b : shuffle(b, rng);
      const teams = a.map((p, i) => [p, bb[i]]);
      let cost = teams.filter(([x, y]) => partners.has(pairKey(x.id, y.id))).length * 3;
      for (let m = 0; m < perRound; m++) {
        const [t1, t2] = [teams[2 * m], teams[2 * m + 1]];
        t1.forEach((x) => t2.forEach((y) => { if (opponents.has(pairKey(x.id, y.id))) cost += 1; }));
      }
      if (!best || cost < best.cost) best = { cost, teams };
      if (cost === 0) break;
    }
    for (let m = 0; m < perRound; m++) {
      const [t1, t2] = [best.teams[2 * m], best.teams[2 * m + 1]];
      t1.concat(t2).forEach((p) => played.set(p.id, (played.get(p.id) || 0) + 1));
      partners.add(pairKey(t1[0].id, t1[1].id));
      partners.add(pairKey(t2[0].id, t2[1].id));
      t1.forEach((x) => t2.forEach((y) => opponents.add(pairKey(x.id, y.id))));
      const side = ([x, y]) => ({ players: [x.id, y.id], name: teamName(x, y), cls: CROSS_CLASS });
      matches.push({ stage: 'warmup', round: r + 1, label: `Khởi động vòng ${r + 1}`, a: side(t1), b: side(t2), countsForClass: false });
    }
  }
  return matches;
}

// Vòng bảng đan chéo: mỗi cặp đấu matchesPerTeam cặp của lớp kia.
// Hai lớp bằng số cặp: xếp vòng tròn lệch (cặp i gặp cặp i, i+1, ... của lớp kia), ai cũng đúng số trận.
// Lệch số cặp (hoặc có cặp liên lớp): ghép tham lam, ưu tiên khác lớp; trận cùng lớp không tính điểm lớp.
// Trả về { matches, short } với short là các cặp không đủ số trận.
export function crossClassPool(teams110, teams111, matchesPerTeam, extraTeams = []) {
  const spec = (x, y, round) => ({
    stage: 'pool', round, label: 'Vòng bảng', a: teamSide(x), b: teamSide(y), countsForClass: countsForClass(x, y),
  });
  if (teams110.length === teams111.length && !extraTeams.length) {
    const n = teams110.length;
    const k = Math.min(matchesPerTeam, n);
    const matches = [];
    for (let j = 0; j < k; j++) for (let i = 0; i < n; i++) matches.push(spec(teams110[i], teams111[(i + j) % n], j + 1));
    return { matches, short: [] };
  }

  const all = [...teams110, ...teams111, ...extraTeams];
  const k = Math.min(matchesPerTeam, all.length - 1);
  const need = new Map(all.map((t) => [t.id, k]));
  const seen = new Set();
  const matches = [];
  let round = 1;
  for (;;) {
    const cands = all.filter((t) => need.get(t.id) > 0).sort((x, y) => need.get(y.id) - need.get(x.id));
    if (cands.length < 2) break;
    const x = cands[0];
    const opts = cands.slice(1).filter((y) => !seen.has(pairKey(x.id, y.id)));
    if (!opts.length) {
      need.set(x.id, 0);
      continue;
    }
    opts.sort((y1, y2) => Number(countsForClass(x, y2)) - Number(countsForClass(x, y1)) || need.get(y2.id) - need.get(y1.id));
    const y = opts[0];
    matches.push(spec(x, y, round));
    round = Math.floor(matches.length / Math.max(1, Math.floor(all.length / 2))) + 1;
    seen.add(pairKey(x.id, y.id));
    need.set(x.id, need.get(x.id) - 1);
    need.set(y.id, need.get(y.id) - 1);
  }
  const count = new Map(all.map((t) => [t.id, 0]));
  matches.forEach((m) => { count.set(m.a.teamId, count.get(m.a.teamId) + 1); count.set(m.b.teamId, count.get(m.b.teamId) + 1); });
  return { matches, short: all.filter((t) => count.get(t.id) < k).map((t) => t.name) };
}

// Vòng tròn trong một bảng (thuật toán xoay vòng tròn). Số đội lẻ thì mỗi vòng một đội nghỉ.
export function roundRobin(teams) {
  const list = teams.length % 2 ? [...teams, null] : [...teams];
  const n = list.length;
  const matches = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const x = list[i];
      const y = list[n - 1 - i];
      if (x && y) matches.push({ stage: 'pool', round: r + 1, label: 'Vòng tròn', a: teamSide(x), b: teamSide(y), countsForClass: countsForClass(x, y) });
    }
    list.splice(1, 0, list.pop());
  }
  return matches;
}

const sideIds = (m) => [...(m.a?.players || []), ...(m.b?.players || [])];

// Xếp trận vào sân và khung giờ. Mỗi khung có tối đa số sân trận; một người không đánh hai trận cùng khung;
// ưu tiên không để ai đánh hai khung liền nhau, chỉ phá lệ khi còn sân trống mà không còn trận nào khác.
// Trận chưa biết đội (nhánh đấu chờ kết quả) được xếp ở khung sau trận nguồn của nó.
export function assignCourts(specs, courts, minutesPerMatch, startMin, slotOffset = 0) {
  const queue = specs.map((m, i) => ({ m, i }));
  const out = [];
  const slotOfKey = new Map();
  let prevBusy = new Set();
  let slot = 0;
  while (queue.length) {
    const busy = new Set();
    const chosen = [];
    for (const strict of [true, false]) {
      for (const item of queue) {
        if (chosen.length >= courts.length) break;
        if (item.taken) continue;
        const { m } = item;
        const deps = [m.srcA?.key, m.srcB?.key].filter(Boolean);
        if (deps.some((k) => !slotOfKey.has(k) || slotOfKey.get(k) >= slot)) continue;
        const ids = sideIds(m);
        if (ids.some((id) => busy.has(id))) continue;
        if (strict && ids.some((id) => prevBusy.has(id))) continue;
        item.taken = true;
        chosen.push(m);
        ids.forEach((id) => busy.add(id));
      }
    }
    if (!chosen.length) break;
    for (let q = queue.length - 1; q >= 0; q--) if (queue[q].taken) queue.splice(q, 1);
    chosen.forEach((m, ci) => {
      if (m.key) slotOfKey.set(m.key, slot);
      out.push({ ...m, slot: slot + slotOffset, court: courts[ci].id, startAt: fmtMin(startMin + slot * minutesPerMatch) });
    });
    prevBusy = busy;
    slot++;
  }
  return { matches: out, slots: slot, endMin: startMin + slot * minutesPerMatch };
}

// Hàng chờ sân: đề xuất trận kế tiếp cho một sân vừa trống.
// Bỏ qua trận có người đang ở sân khác hoặc chưa biết đội; ưu tiên trận mà không ai vừa đánh xong,
// rồi trận vốn xếp ở sân này, rồi trận xếp sớm nhất.
export function suggestNext(matches, courtId) {
  const onCourt = new Set(matches.filter((m) => m.status === 'called' || m.status === 'live').flatMap(sideIds));
  const finished = matches.filter((m) => m.status === 'done' || m.status === 'walkover');
  const lastSlot = Math.max(-1, ...finished.map((m) => m.slot ?? -1));
  const justPlayed = new Set(finished.filter((m) => m.slot === lastSlot).flatMap(sideIds));
  const cands = matches.filter((m) => m.status === 'scheduled' && m.a && m.b && !sideIds(m).some((id) => onCourt.has(id)));
  const score = (m) => [sideIds(m).some((id) => justPlayed.has(id)) ? 1 : 0, m.court === courtId ? 0 : 1, m.slot ?? 0];
  cands.sort((x, y) => {
    const [a, b] = [score(x), score(y)];
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });
  return cands[0] || null;
}

// Trợ lý thể thức: từ số cặp, số nam nữ, số sân và khung giờ, đề xuất điểm thắng ván, số trận mỗi cặp,
// số vòng khởi động, số cặp vào chung kết, và giờ kết thúc dự kiến.
// teamCounts: số cặp của từng lớp (kể cả cặp liên lớp nằm trong tổng); genderCounts: [{ male, female }] mỗi lớp.
export function suggestFormat({ teamCounts, genderCounts, playerCounts, courtCount, settings }) {
  const c = Math.max(1, courtCount);
  const nTeams = teamCounts.reduce((s, n) => s + n, 0);
  const avail = toMin(settings.endTime) - toMin(settings.startTime);
  const reasons = [];
  const canClash = genderCounts.length === 2 && genderCounts.every((g) => g.male >= 2 && g.female >= 2);
  const clash = Boolean(settings.stages.clash && canClash);
  if (settings.stages.clash && !canClash) reasons.push('Không xếp trận siêu kinh điển vì mỗi lớp cần ít nhất 2 nam và 2 nữ đã khai giới tính.');
  const canWarmup = playerCounts.every((n) => n >= 2);
  const maxOpp = teamCounts[0] === teamCounts[1] ? teamCounts[0] : Math.max(nTeams - 1, 0);

  const pointOptions = settings.minutesPerMatch ? [settings.pointsToWin] : [15, 11];
  const playoffWanted = settings.stages.playoff ? (nTeams >= 4 ? 4 : nTeams >= 2 ? 2 : 0) : 0;
  const configs = [
    { warmup: settings.stages.warmup && canWarmup, playoff: playoffWanted },
    { warmup: false, playoff: playoffWanted },
    { warmup: false, playoff: Math.min(playoffWanted, 2) },
  ];

  if (teamCounts.slice(0, 2).some((n) => n === 0)) {
    return { fits: false, reasons: [...reasons, 'Mỗi lớp cần có ít nhất 1 cặp. Vào trang Người chơi để ghép cặp trước.'] };
  }

  for (const pts of pointOptions) {
    const minutes = settings.minutesPerMatch || estimateMinutes({ pointsToWin: pts, gamesPerMatch: settings.gamesPerMatch });
    for (const cfg of configs) {
      const stages = 1 + (cfg.warmup ? 1 : 0) + (cfg.playoff ? 1 : 0) + (clash ? 1 : 0);
      const breaks = (stages - 1) * settings.breakMinutes;
      const slotsAvail = Math.floor((avail - breaks) / minutes);
      const warmupRounds = cfg.warmup ? 2 : 0;
      const playoffSlots = cfg.playoff === 4 ? Math.ceil(2 / c) + 1 : cfg.playoff === 2 ? 1 : 0;
      const clashSlots = clash ? Math.ceil(4 / c) + 1 : 0;
      const poolSlots = slotsAvail - warmupRounds - playoffSlots - clashSlots;
      if (poolSlots < 1) continue;
      const perSlot = Math.min(c, Math.floor(nTeams / 2));
      const k = Math.min(5, maxOpp, Math.floor((2 * poolSlots * perSlot) / nTeams));
      if (k < (pts >= 15 ? 3 : 1)) continue;
      const poolMatchSlots = Math.ceil((nTeams * k) / 2 / perSlot);
      const used = warmupRounds + poolMatchSlots + playoffSlots + clashSlots;
      if (pts !== settings.pointsToWin) reasons.push(`Đề xuất chơi tới ${pts} điểm vì ${pts > settings.pointsToWin ? 'còn dư thời gian' : 'thời gian không đủ cho ván dài hơn'}.`);
      if (settings.stages.warmup && !cfg.warmup) reasons.push('Bỏ phần khởi động để đủ giờ cho vòng bảng.');
      if (cfg.playoff && cfg.playoff < playoffWanted) reasons.push('Chỉ còn đủ giờ cho trận chung kết 2 cặp, không có bán kết.');
      return {
        fits: true,
        pointsToWin: pts,
        minutesPerMatch: minutes,
        warmupRounds,
        matchesPerTeam: k,
        playoffTeams: cfg.playoff,
        clash,
        endTime: fmtMin(toMin(settings.startTime) + used * minutes + breaks),
        reasons,
      };
    }
  }
  return { fits: false, reasons: [...reasons, 'Không đủ thời gian cho dù mỗi cặp chỉ đánh 1 trận. Hãy thêm sân, kéo dài giờ, hoặc chọn mẫu luật "Chơi nhanh".'] };
}
