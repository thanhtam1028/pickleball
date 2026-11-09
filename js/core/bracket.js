// Nhánh loại trực tiếp và trận đồng đội kiểu MLP. Hàm thuần.
// Trận nhánh chưa biết đội ghi nguồn: srcA = { key: 'semi-1', take: 'winner' | 'loser' }.

const src = (key, take = 'winner') => ({ key, take });

// seeds: danh sách bên đã xếp hạng (hạng 1 đứng đầu). Hỗ trợ 2, 4, 8 đội.
export function singleElimination(seeds) {
  const m = (key, stage, label, a, b, srcA, srcB) => ({
    key, stage, label, a: a || null, b: b || null, ...(srcA ? { srcA } : {}), ...(srcB ? { srcB } : {}), countsForClass: false,
  });
  const s = seeds;
  if (s.length === 2) return [m('final', 'final', 'Chung kết', s[0], s[1])];
  const finals = [
    m('final', 'final', 'Chung kết', null, null, src('semi-1'), src('semi-2')),
    m('third', 'third', 'Tranh hạng ba', null, null, src('semi-1', 'loser'), src('semi-2', 'loser')),
  ];
  if (s.length === 4) {
    return [
      m('semi-1', 'semi', 'Bán kết 1', s[0], s[3]),
      m('semi-2', 'semi', 'Bán kết 2', s[1], s[2]),
      ...finals,
    ];
  }
  if (s.length === 8) {
    return [
      m('qf-1', 'quarter', 'Tứ kết 1', s[0], s[7]),
      m('qf-2', 'quarter', 'Tứ kết 2', s[3], s[4]),
      m('qf-3', 'quarter', 'Tứ kết 3', s[1], s[6]),
      m('qf-4', 'quarter', 'Tứ kết 4', s[2], s[5]),
      m('semi-1', 'semi', 'Bán kết 1', null, null, src('qf-1'), src('qf-2')),
      m('semi-2', 'semi', 'Bán kết 2', null, null, src('qf-3'), src('qf-4')),
      ...finals,
    ];
  }
  throw new Error('Nhánh đấu chỉ hỗ trợ 2, 4 hoặc 8 đội');
}

const isDone = (m) => m.status === 'done' || m.status === 'walkover';
const pickSide = (m, take) => {
  if (!isDone(m) || !m.winner) return null;
  const winnerIsA = m.winner === 'A';
  return take === 'winner' ? (winnerIsA ? m.a : m.b) : (winnerIsA ? m.b : m.a);
};

// Điền đội cho trận nhánh khi trận nguồn đã xong. Trả về [{ id, patch }] để ghi vào Firestore.
export function resolveBracket(matches) {
  const byKey = new Map(matches.filter((m) => m.key).map((m) => [m.key, m]));
  const updates = [];
  matches.forEach((m) => {
    const patch = {};
    ['A', 'B'].forEach((s) => {
      const source = m[`src${s}`];
      const field = s.toLowerCase();
      if (!source || m[field]) return;
      const side = byKey.get(source.key) && pickSide(byKey.get(source.key), source.take);
      if (side) patch[field] = side;
    });
    if (Object.keys(patch).length) updates.push({ id: m.id, patch });
  });
  return updates;
}

// Trận siêu kinh điển: lineup = { men: [p, p], women: [p, p] } với p = { id, name }.
export function teamClash(cls110, lineup110, cls111, lineup111) {
  const side = (cls, ps) => ({ players: ps.map((p) => p.id), name: ps.map((p) => p.name.split(/\s+/).pop()).join(' & '), cls });
  const pair = (label, key, pick) => ({
    key, stage: 'clash', label, a: side(cls110, pick(lineup110)), b: side(cls111, pick(lineup111)), countsForClass: false,
  });
  return [
    pair('Siêu kinh điển: Đôi nam', 'clash-md', (l) => l.men),
    pair('Siêu kinh điển: Đôi nữ', 'clash-wd', (l) => l.women),
    pair('Siêu kinh điển: Đôi nam nữ 1', 'clash-x1', (l) => [l.men[0], l.women[0]]),
    pair('Siêu kinh điển: Đôi nam nữ 2', 'clash-x2', (l) => [l.men[1], l.women[1]]),
  ];
}

// Kết quả trận siêu kinh điển: hòa 2–2 thì cần trận phân định đánh đơn xoay người.
export function clashResult(matches) {
  const regular = matches.filter((m) => m.stage === 'clash');
  const breaker = matches.find((m) => m.stage === 'clash-db');
  const winsA = regular.filter((m) => isDone(m) && m.winner === 'A').length;
  const winsB = regular.filter((m) => isDone(m) && m.winner === 'B').length;
  const allDone = regular.length === 4 && regular.every(isDone);
  let winner = null;
  if (allDone && winsA !== winsB) winner = winsA > winsB ? 'A' : 'B';
  if (breaker && isDone(breaker)) winner = breaker.winner;
  return { winsA, winsB, allDone, needBreaker: allDone && winsA === winsB && !breaker, winner };
}

export function dreamBreaker(regularMatches) {
  const first = regularMatches.find((m) => m.key === 'clash-x1') || regularMatches[0];
  const all = (s) => [...new Set(regularMatches.flatMap((m) => m[s].players))];
  return {
    key: 'clash-db',
    stage: 'clash-db',
    label: 'Siêu kinh điển: Phân định (đánh đơn xoay người tới 21)',
    a: { players: all('a'), name: first.a.cls, cls: first.a.cls },
    b: { players: all('b'), name: first.b.cls, cls: first.b.cls },
    countsForClass: false,
  };
}
