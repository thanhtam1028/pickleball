import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUsername, usernameToEmail, emailToUsername, isAccountEmail,
  validateUsername, validatePassword, generatePassword, authErrorText,
} from '../js/core/accounts.js';

test('tên đăng nhập được chuẩn hóa và đổi qua lại với email nội bộ', () => {
  assert.equal(normalizeUsername('  Lop.Truong '), 'lop.truong');
  assert.equal(usernameToEmail('Lop.Truong'), 'lop.truong@taikhoan.pickleball.local');
  assert.equal(emailToUsername('lop.truong@taikhoan.pickleball.local'), 'lop.truong');
  assert.ok(isAccountEmail('a@taikhoan.pickleball.local'));
  assert.ok(!isAccountEmail('tcaoadm@gmail.com'));
});

test('kiểm tra tên đăng nhập', () => {
  assert.equal(validateUsername('quan-ly_1'), null);
  assert.ok(validateUsername('ab'));
  assert.ok(validateUsername('có dấu'));
  assert.ok(validateUsername('co khoang trang'));
  assert.ok(validateUsername('a'.repeat(31)));
});

test('mật khẩu yếu bị từ chối, kể cả admin và các biến thể dễ đoán', () => {
  for (const weak of ['admin', 'admin123', 'Admin1234', 'password1', '12345678', 'abcdefgh', 'short1']) {
    assert.ok(validatePassword(weak, 'quanly'), `${weak} phải bị từ chối`);
  }
});

test('mật khẩu không được chứa tên đăng nhập; mật khẩu tốt được chấp nhận', () => {
  assert.ok(validatePassword('quanly2026x', 'quanly'));
  assert.equal(validatePassword('Xk7mQ2vRt9wB', 'quanly'), null);
  assert.equal(validatePassword('san-pickle-77', 'quanly'), null);
});

test('mật khẩu ngẫu nhiên: đủ dài, có chữ và số, luôn qua kiểm tra, không trùng nhau', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    const p = generatePassword(12);
    assert.equal(p.length, 12);
    assert.equal(validatePassword(p, 'quanly'), null, p);
    assert.ok(!/[0OIl1]/.test(p), `chứa ký tự dễ nhầm: ${p}`);
    seen.add(p);
  }
  assert.equal(seen.size, 50);
});

test('lời nhắn lỗi', () => {
  assert.match(authErrorText('auth/invalid-credential'), /Sai tên đăng nhập/);
  assert.match(authErrorText('auth/email-already-in-use'), /đã có người dùng/);
  assert.match(authErrorText('khac'), /Thử lại/);
});
