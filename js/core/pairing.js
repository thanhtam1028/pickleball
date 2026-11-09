// Hàm thuần cho người chơi và ghép cặp. Không đụng giao diện hay Firebase để test được bằng node --test.

// Nhãn lớp của cặp ghép từ hai lớp khác nhau; trận có cặp này không tính điểm cho lớp.
export const CROSS_CLASS = 'Liên lớp';

const MALE = new Set(['nam', 'n', 'm', 'male', 'trai']);
const FEMALE = new Set(['nữ', 'nu', 'f', 'female', 'gái', 'gai']);

export function parseGender(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (MALE.has(v)) return 'M';
  if (FEMALE.has(v)) return 'F';
  return null;
}

export function clampLevel(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n));
}

// Đọc danh sách dán vào, mỗi dòng "Tên, Nam/Nữ, trình độ". Số thứ tự đầu dòng ("1." hoặc "1)") được bỏ qua.
// Giới tính bỏ trống thì là chưa rõ (null), trình độ bỏ trống thì là 3; ghi sai giới tính thì báo lỗi.
export function parsePlayerLines(text, cls) {
  const players = [];
  const errors = [];
  String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim().replace(/^\d+\s*[.)]\s*/, '');
    if (!line) return;
    const parts = line.split(/[,;\t]/).map((s) => s.trim());
    const name = parts[0];
    if (!name) {
      errors.push(`Dòng ${i + 1}: thiếu tên`);
      return;
    }
    const gender = parts[1] ? parseGender(parts[1]) : null;
    if (parts[1] && !gender) {
      errors.push(`Dòng ${i + 1} (${name}): ghi giới tính là Nam hoặc Nữ, hoặc bỏ trống`);
      return;
    }
    players.push({ name, cls, gender, level: clampLevel(parts[2] || 3) });
  });
  return { players, errors };
}

// Ghép mạnh với yếu: xếp theo trình độ rồi ghép đầu với cuối để tổng trình độ các cặp gần nhau.
function strongWithWeak(list) {
  const sorted = [...list].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, 'vi'));
  const teams = [];
  let i = 0;
  let j = sorted.length - 1;
  while (i < j) teams.push([sorted[i++], sorted[j--]]);
  return { teams, leftover: i === j ? [sorted[i]] : [] };
}

// Ghép cặp trong một lớp. preferMixed: ưu tiên đôi nam nữ, nam mạnh đi với nữ yếu hơn;
// người chưa rõ giới tính được ghép sau cùng với những người còn lại.
export function autoPair(players, { preferMixed = false } = {}) {
  if (!preferMixed) return strongWithWeak(players);
  const byLevelDesc = (a, b) => b.level - a.level || a.name.localeCompare(b.name, 'vi');
  const men = players.filter((p) => p.gender === 'M').sort(byLevelDesc);
  const women = players.filter((p) => p.gender === 'F').sort(byLevelDesc).reverse();
  const mixedCount = Math.min(men.length, women.length);
  const teams = [];
  for (let k = 0; k < mixedCount; k++) teams.push([men[k], women[k]]);
  const unknown = players.filter((p) => p.gender !== 'M' && p.gender !== 'F');
  const rest = strongWithWeak([...men.slice(mixedCount), ...women.slice(mixedCount), ...unknown]);
  return { teams: [...teams, ...rest.teams], leftover: rest.leftover };
}

export function teamLevel(team) {
  return team.reduce((sum, p) => sum + p.level, 0);
}

// Tên cặp mặc định: tên gọi (chữ cuối) của hai người.
export function teamName(a, b) {
  const given = (p) => p.name.trim().split(/\s+/).pop();
  return `${given(a)} & ${given(b)}`;
}

// Đếm theo lớp: tổng, nam, nữ, đã điểm danh, đã có cặp, còn lẻ.
export function countSummary(players, teams, classes) {
  const paired = new Set(teams.flatMap((t) => t.players));
  return classes.map((cls) => {
    const list = players.filter((p) => p.cls === cls);
    return {
      cls,
      total: list.length,
      male: list.filter((p) => p.gender === 'M').length,
      female: list.filter((p) => p.gender === 'F').length,
      unknownGender: list.filter((p) => p.gender !== 'M' && p.gender !== 'F').length,
      checkedIn: list.filter((p) => p.checkedIn).length,
      teams: teams.filter((t) => t.cls === cls).length,
      unpaired: list.filter((p) => !paired.has(p.id)).length,
    };
  });
}
