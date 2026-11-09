// Chạy nền khi người dùng là ban tổ chức, ở bất kỳ trang nào: tự điền đội vào trận nhánh đấu khi trận nguồn xong,
// và tự thêm trận phân định khi siêu kinh điển hòa 2–2. Ghi bằng mã cố định nên nhiều máy chạy cùng lúc cũng không tạo trùng.
import { watchList, watchEvent, subDoc } from './data.js';
import { withDefaults, minutesPerMatch } from './core/settings.js';
import { resolveBracket, clashResult, dreamBreaker } from './core/bracket.js';
import { fmtMin } from './core/time.js';
import { lastEnd } from './match-format.js';

export function startAutoAdvance(fs) {
  let settings = withDefaults();
  let busy = false;

  async function advance(matches) {
    if (busy) return;
    const updates = resolveBracket(matches);
    const clash = matches.filter((m) => m.stage === 'clash' || m.stage === 'clash-db');
    const needBreaker = clash.length > 0 && clashResult(clash).needBreaker;
    if (!updates.length && !needBreaker) return;
    busy = true;
    try {
      const batch = fs.writeBatch(fs.db);
      updates.forEach((u) => batch.update(subDoc(fs, 'matches', u.id), u.patch));
      if (needBreaker) {
        batch.set(subDoc(fs, 'matches', 'clash-db'), {
          ...dreamBreaker(clash.filter((m) => m.stage === 'clash')),
          slot: Math.max(...matches.map((m) => m.slot ?? 0)) + 1,
          court: settings.courts[0].id,
          startAt: fmtMin(lastEnd(matches, minutesPerMatch(settings))),
          status: 'scheduled', games: [], winner: null, createdAt: fs.serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (err) {
      console.error('Tự điền nhánh đấu không thành công', err);
    } finally {
      busy = false;
    }
  }

  const unsubs = [
    watchEvent(fs, (ev) => { settings = withDefaults(ev?.settings); }),
    watchList(fs, 'matches', advance),
  ];
  return () => unsubs.forEach((u) => u());
}
