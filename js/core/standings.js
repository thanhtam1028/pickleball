// Xếp hạng cặp, điểm lớp và điểm cá nhân từ các trận đã xong. Hàm thuần.
// Trận lưu games: [{ a, b }] (điểm từng ván) và winner: 'A' | 'B'. Trận xử thua đã lưu sẵn tỷ số mặc định.
import { clashResult } from './bracket.js';

export const isDone = (m) => (m.status === 'done' || m.status === 'walkover') && Boolean(m.winner);
const points = (m, s) => (m.games || []).reduce((sum, g) => sum + g[s], 0);
const winnerSide = (m) => (m.winner === 'A' ? m.a : m.b);

// Phân hạng: số trận thắng → đối đầu (chỉ khi đúng 2 cặp bằng nhau) → hiệu số → tổng điểm ghi
// → thứ tự bốc thăm do ban tổ chức bấm (drawOrder: { teamId: số thứ tự }) → tên.
export function rankTeams(matches, teams, stages = ['pool'], drawOrder = {}) {
  const rows = new Map(teams.map((t) => [t.id, { id: t.id, name: t.name, cls: t.cls, played: 0, wins: 0, losses: 0, pf: 0, pa: 0 }]));
  const played = matches.filter((m) => stages.includes(m.stage) && isDone(m));
  played.forEach((m) => {
    const ra = rows.get(m.a?.teamId);
    const rb = rows.get(m.b?.teamId);
    if (!ra || !rb) return;
    const pa = points(m, 'a');
    const pb = points(m, 'b');
    ra.played++; rb.played++;
    ra.pf += pa; ra.pa += pb; rb.pf += pb; rb.pa += pa;
    if (m.winner === 'A') { ra.wins++; rb.losses++; } else { rb.wins++; ra.losses++; }
  });
  // Đối đầu: đếm số trận thắng của mỗi bên trong các trận gặp nhau; bằng nhau thì xét tiếp hiệu số.
  const headToHead = (x, y) => {
    let net = 0;
    played
      .filter((g) => (g.a.teamId === x.id && g.b.teamId === y.id) || (g.a.teamId === y.id && g.b.teamId === x.id))
      .forEach((g) => { net += (g.a.teamId === x.id) === (g.winner === 'A') ? 1 : -1; });
    return -Math.sign(net);
  };
  const list = [...rows.values()].map((r) => ({ ...r, diff: r.pf - r.pa }));
  const draw = (r) => drawOrder[r.id] ?? Number.MAX_SAFE_INTEGER;
  list.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (list.filter((r) => r.wins === x.wins).length === 2) {
      const h = headToHead(x, y);
      if (h) return h;
    }
    return y.diff - x.diff || y.pf - x.pf || draw(x) - draw(y) || x.name.localeCompare(y.name, 'vi');
  });
  // Đánh dấu nhóm bằng nhau hoàn toàn (cần bốc thăm) để giao diện hiện nút.
  list.forEach((r) => {
    r.tiedWith = list.filter((o) => o !== r && o.wins === r.wins && o.diff === r.diff && o.pf === r.pf && o.played > 0).map((o) => o.id);
  });
  return list;
}

// Điểm lớp: thắng vòng bảng (trận tính điểm lớp), thắng tứ kết hoặc bán kết, thắng chung kết, thắng siêu kinh điển.
export function classScore(matches, classPoints, classes) {
  const score = Object.fromEntries(classes.map((c) => [c, { total: 0, pool: 0, semi: 0, final: 0, clash: 0, wins: 0 }]));
  const add = (cls, key, pts) => {
    if (!score[cls] || !pts) return;
    score[cls][key] += pts;
    score[cls].total += pts;
  };
  matches.filter(isDone).forEach((m) => {
    const w = winnerSide(m);
    if (m.stage === 'pool' && m.countsForClass) {
      add(w?.cls, 'pool', classPoints.pool);
      if (score[w?.cls]) score[w.cls].wins++;
    }
    if (m.stage === 'semi' || m.stage === 'quarter') add(w?.cls, 'semi', classPoints.semi);
    if (m.stage === 'final') add(w?.cls, 'final', classPoints.final);
  });
  const clash = matches.filter((m) => m.stage === 'clash' || m.stage === 'clash-db');
  if (clash.length) {
    const r = clashResult(clash);
    const any = clash.find((m) => m.a && m.b);
    if (r.winner && any) add(any[r.winner.toLowerCase()].cls, 'clash', classPoints.clash);
  }
  return score;
}

// Điểm cá nhân phần khởi động: mỗi người cộng số trận thắng và hiệu số của đội mình.
export function mixerRanking(matches, players) {
  const rows = new Map();
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { id, name: players.find((p) => p.id === id)?.name || '?', cls: players.find((p) => p.id === id)?.cls, played: 0, wins: 0, diff: 0 });
    return rows.get(id);
  };
  matches.filter((m) => m.stage === 'warmup' && isDone(m)).forEach((m) => {
    const da = points(m, 'a') - points(m, 'b');
    m.a.players.forEach((id) => { const r = row(id); r.played++; r.diff += da; if (m.winner === 'A') r.wins++; });
    m.b.players.forEach((id) => { const r = row(id); r.played++; r.diff -= da; if (m.winner === 'B') r.wins++; });
  });
  return [...rows.values()].sort((x, y) => y.wins - x.wins || y.diff - x.diff || x.name.localeCompare(y.name, 'vi'));
}
