// Đếm phiếu bình chọn. Phiếu: { mvp: mã người chơi, fairplay: mã người chơi, voterPlayerId? }.
// Phiếu tự bầu cho chính mình bị bỏ qua ở hạng mục đó (luật Firebase cũng chặn khi ghi).

export function tallyVotes(votes, players, top = 5) {
  const nameOf = (id) => players.find((p) => p.id === id)?.name || '?';
  const count = (key) => {
    const m = new Map();
    votes.forEach((v) => {
      const id = v[key];
      if (!id || id === v.voterPlayerId) return;
      m.set(id, (m.get(id) || 0) + 1);
    });
    return [...m].map(([id, n]) => ({ id, name: nameOf(id), count: n }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'))
      .slice(0, top);
  };
  return { mvp: count('mvp'), fairplay: count('fairplay'), total: votes.length };
}
