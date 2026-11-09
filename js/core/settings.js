// Cài đặt giải: giá trị mặc định, ba mẫu luật dựng sẵn, và ước tính thời lượng trận.

export const DEFAULT_SETTINGS = {
  scoringMode: 'rally',
  pointsToWin: 11,
  winBy: 2,
  pointCap: 15,
  gamesPerMatch: 1,
  rallyWinOnServeOnly: false,
  timeoutsPerGame: 2,
  courts: [
    { id: 'san-1', name: 'Sân 1' },
    { id: 'san-2', name: 'Sân 2' },
  ],
  startTime: '08:00',
  endTime: '12:00',
  breakMinutes: 10,
  minutesPerMatch: null,
  classPoints: { pool: 2, semi: 3, final: 5, clash: 5 },
  stages: { warmup: true, pool: true, playoff: true, clash: false },
};

// Các trường quyết định cách tính điểm; bị khóa khi giải đã có trận bắt đầu.
export const SCORING_FIELDS = [
  'scoringMode', 'pointsToWin', 'winBy', 'pointCap', 'gamesPerMatch', 'rallyWinOnServeOnly', 'timeoutsPerGame',
];

export const PRESETS = {
  beginner: {
    label: 'Người mới (khuyên dùng)',
    desc: 'Mỗi pha một điểm, 1 ván tới 11, hơn 2 điểm, tối đa 15.',
    values: { scoringMode: 'rally', pointsToWin: 11, winBy: 2, pointCap: 15, gamesPerMatch: 1, rallyWinOnServeOnly: false, timeoutsPerGame: 2 },
  },
  standard: {
    label: 'Chuẩn giải đấu',
    desc: 'Chỉ đội giao được điểm, tới 11, hơn 2 điểm, thắng 2 trong 3 ván.',
    values: { scoringMode: 'sideout', pointsToWin: 11, winBy: 2, pointCap: null, gamesPerMatch: 3, rallyWinOnServeOnly: false, timeoutsPerGame: 2 },
  },
  quick: {
    label: 'Chơi nhanh',
    desc: 'Mỗi pha một điểm, 1 ván, ai chạm 11 trước thắng.',
    values: { scoringMode: 'rally', pointsToWin: 11, winBy: 1, pointCap: 11, gamesPerMatch: 1, rallyWinOnServeOnly: false, timeoutsPerGame: 1 },
  },
};

// Ước tính phút mỗi trận: khoảng 1 phút mỗi điểm thắng ván cộng 1 phút chuẩn bị;
// thắng 2 trong 3 ván tính trung bình 2,5 ván.
export function estimateMinutes({ pointsToWin, gamesPerMatch }) {
  const perGame = Number(pointsToWin) + 1;
  const games = Number(gamesPerMatch) >= 3 ? 2.5 : 1;
  return Math.ceil(perGame * games);
}

export function minutesPerMatch(settings) {
  return settings.minutesPerMatch || estimateMinutes(settings);
}

// Gộp cài đặt đã lưu với mặc định, để trường mới thêm sau này vẫn có giá trị.
export function withDefaults(saved = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    classPoints: { ...DEFAULT_SETTINGS.classPoints, ...(saved.classPoints || {}) },
    stages: { ...DEFAULT_SETTINGS.stages, ...(saved.stages || {}) },
    courts: saved.courts?.length ? saved.courts : DEFAULT_SETTINGS.courts,
  };
}

// Đổi số sân: giữ tên các sân cũ, thêm "Sân N" cho sân mới.
export function resizeCourts(courts, count) {
  const n = Math.max(1, Math.min(20, Math.round(Number(count)) || 1));
  return Array.from({ length: n }, (_, i) => courts[i] || { id: `san-${i + 1}`, name: `Sân ${i + 1}` });
}
