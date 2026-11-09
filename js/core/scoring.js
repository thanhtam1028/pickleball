// Bộ tính điểm Pickleball. Hàm thuần: trạng thái luôn được dựng lại từ nhật ký các pha (replay),
// nên hoàn tác chỉ là bỏ pha cuối và tính lại, luôn đúng.
// Sự kiện: { type: 'rally', winner: 'A' | 'B' } | { type: 'timeout', team } | { type: 'undo' }.

export const other = (t) => (t === 'A' ? 'B' : 'A');

// Luật áp dụng cho một trận. Trận phân định của siêu kinh điển: đánh đơn xoay người,
// mỗi pha một điểm tới 21, điểm quyết định phải thắng khi đang giao, nhắc đổi người mỗi 4 điểm.
export function rulesFor(settings, match) {
  if (match?.stage === 'clash-db') {
    return {
      scoringMode: 'rally', pointsToWin: 21, winBy: 2, pointCap: null, gamesPerMatch: 1,
      rallyWinOnServeOnly: true, timeoutsPerGame: 1, singles: true, rotateEvery: 4,
    };
  }
  return {
    scoringMode: settings.scoringMode,
    pointsToWin: settings.pointsToWin,
    winBy: settings.winBy,
    pointCap: settings.pointCap || null,
    gamesPerMatch: settings.gamesPerMatch,
    rallyWinOnServeOnly: settings.scoringMode === 'rally' && Boolean(settings.rallyWinOnServeOnly),
    timeoutsPerGame: settings.timeoutsPerGame,
    singles: false,
    rotateEvery: 0,
  };
}

const score = (s, t) => (t === 'A' ? s.a : s.b);
const winsOf = (games, t) => games.filter((g) => (t === 'A' ? g.a > g.b : g.b > g.a)).length;
const gamesNeeded = (rules) => (rules.gamesPerMatch === 3 ? 2 : 1);

export function gameWon(rules, mine, theirs) {
  if (rules.pointCap && mine >= rules.pointCap) return true;
  return mine >= rules.pointsToWin && mine - theirs >= rules.winBy;
}

// Ván quyết định: trận 1 ván, hoặc ván 3 khi hai đội đã thắng mỗi bên một ván.
function isDeciding(s) {
  const need = gamesNeeded(s.rules);
  return winsOf(s.games, 'A') === need - 1 && winsOf(s.games, 'B') === need - 1;
}

// Đánh đôi: right[T] là người (0 hoặc 1) đang đứng ô phải. Người giao đứng ô phải khi điểm đội mình chẵn.
function newGame(rules, firstServer, games, gameNo) {
  return {
    rules,
    games,
    gameNo,
    a: 0,
    b: 0,
    server: firstServer,
    gameFirstServer: firstServer,
    // Cách truyền thống: lượt đầu ván đội giao trước chỉ có 1 người giao, nên bắt đầu là "người số 2".
    serverNum: rules.scoringMode === 'sideout' && !rules.singles ? 2 : 1,
    serverIdx: 0,
    right: { A: 0, B: 0 },
    timeouts: { A: rules.timeoutsPerGame, B: rules.timeoutsPerGame },
    switched: false,
    alerts: [],
    matchOver: false,
    winner: null,
  };
}

export function initialState(rules, firstServer = 'A') {
  return newGame(rules, firstServer, [], 1);
}

function serverByParity(s, team) {
  const even = score(s, team) % 2 === 0;
  return even ? s.right[team] : 1 - s.right[team];
}

function finalize(s, point) {
  const r = s.rules;
  if (!point) return s;
  const half = Math.ceil(r.pointsToWin / 2);
  if (!s.switched && isDeciding(s) && Math.max(s.a, s.b) === half) {
    s.switched = true;
    s.alerts.push('switch');
  }
  if (r.rotateEvery && (s.a + s.b) % r.rotateEvery === 0) s.alerts.push('rotate');
  if (gameWon(r, score(s, point), score(s, other(point)))) {
    const games = [...s.games, { a: s.a, b: s.b }];
    if (winsOf(games, point) >= gamesNeeded(r)) {
      return { ...s, games, matchOver: true, winner: point, alerts: [...s.alerts, 'match'] };
    }
    // Ván mới: đội nhận bóng đầu ván trước sẽ giao trước.
    const next = newGame(r, other(s.gameFirstServer), games, s.gameNo + 1);
    next.alerts = [...s.alerts, 'game'];
    return next;
  }
  const nearA = gameWon(r, s.a + 1, s.b);
  const nearB = gameWon(r, s.b + 1, s.a);
  if (nearA || nearB) s.alerts.push('gamepoint');
  return s;
}

export function applyEvent(prev, ev) {
  if (prev.matchOver) return prev;
  const s = { ...prev, right: { ...prev.right }, timeouts: { ...prev.timeouts }, alerts: [] };
  if (ev.type === 'timeout') {
    if (s.timeouts[ev.team] > 0) {
      s.timeouts[ev.team] -= 1;
      s.alerts = ['timeout'];
    }
    return s;
  }
  const r = s.rules;
  const w = ev.winner;
  const srv = s.server;
  let point = null;

  if (w === srv) {
    // Đội giao thắng pha: được điểm, người giao đổi ô với đồng đội và giao tiếp.
    point = w;
    if (!r.singles) s.right[w] = 1 - s.right[w];
  } else if (r.scoringMode === 'rally') {
    // Mỗi pha một điểm: đội nhận thắng pha thì được điểm và giành quyền giao,
    // trừ khi bật "điểm quyết định phải thắng khi đang giao" và pha này sẽ kết thúc ván.
    const wouldWin = gameWon(r, score(s, w) + 1, score(s, srv));
    s.server = w;
    s.serverNum = 1;
    if (!(r.rallyWinOnServeOnly && wouldWin)) point = w;
  } else if (!r.singles && s.serverNum === 1) {
    // Chỉ đội giao được điểm: người số 1 mất pha thì chuyển sang người số 2 của cùng đội.
    s.serverNum = 2;
    s.serverIdx = 1 - s.serverIdx;
    return s;
  } else {
    // Mất quyền giao (side out).
    s.server = w;
    s.serverNum = 1;
  }

  if (point === 'A') s.a += 1;
  if (point === 'B') s.b += 1;
  if (s.server !== srv) s.serverIdx = r.singles ? 0 : serverByParity(s, s.server);
  return finalize(s, point);
}

// Dựng lại trạng thái từ nhật ký; "undo" bỏ sự kiện hiệu lực gần nhất.
export function effectiveEvents(events) {
  const out = [];
  events.forEach((ev) => (ev.type === 'undo' ? out.pop() : out.push(ev)));
  return out;
}

export function replay(rules, firstServer, events) {
  return effectiveEvents(events).reduce(applyEvent, initialState(rules, firstServer));
}

// Câu đọc điểm: cách truyền thống "điểm đội giao – điểm đội nhận – người giao số mấy",
// cách mỗi pha một điểm "điểm đội giao – điểm đội nhận".
export function callout(s) {
  const mine = score(s, s.server);
  const theirs = score(s, other(s.server));
  if (s.rules.scoringMode === 'sideout' && !s.rules.singles) return `${mine} – ${theirs} – ${s.serverNum}`;
  return `${mine} – ${theirs}`;
}

// Người giao đứng ô nào: điểm đội giao chẵn thì ô phải.
export function serveSide(s) {
  return score(s, s.server) % 2 === 0 ? 'right' : 'left';
}

// Tóm tắt lưu vào tài liệu trận cho màn hình người xem.
export function summary(s) {
  return {
    a: s.a,
    b: s.b,
    server: s.server,
    serverNum: s.serverNum,
    serverIdx: s.serverIdx,
    callout: callout(s),
    gameNo: s.gameNo,
  };
}

// Đọc tỷ số ban tổ chức gõ tay, ví dụ "11-7, 9-11, 11-5". Trả về { games, winner } hoặc { error }.
export function parseGamesText(text, gamesPerMatch = 1) {
  const parts = String(text || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { error: 'Nhập tỷ số, ví dụ 11-7 hoặc 11-7, 9-11, 11-5' };
  const games = [];
  for (const p of parts) {
    const m = p.match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);
    if (!m) return { error: `Không đọc được "${p}". Viết dạng 11-7.` };
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === b) return { error: `Ván "${p}" hòa, không hợp lệ.` };
    games.push({ a, b });
  }
  const winsA = games.filter((g) => g.a > g.b).length;
  const winsB = games.length - winsA;
  const need = gamesPerMatch === 3 ? 2 : 1;
  if (Math.max(winsA, winsB) < need || winsA === winsB) return { error: 'Tỷ số chưa đủ để có đội thắng trận.' };
  return { games, winner: winsA > winsB ? 'A' : 'B' };
}
