import { firebaseConfig, ADMIN_EMAIL } from './firebase-config.js';
import { usernameToEmail, isAccountEmail, emailToUsername, authErrorText } from './core/accounts.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';

export const ROLE_LABEL = {
  admin: 'Ban tổ chức',
  referee: 'Trọng tài',
  pending: 'Chờ duyệt',
  guest: 'Khách',
};

// Trạng thái phiên dùng chung cho cả website.
export const session = {
  configured: Boolean(firebaseConfig),
  ready: false,
  user: null,
  role: 'guest',
  error: null,
};

const listeners = new Set();
let fb = null;

function emit() {
  listeners.forEach((fn) => fn(session));
}

export function onSession(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Nạp Firebase chỉ khi đã có cấu hình, để chế độ xem thử chạy được cả khi không có mạng.
export async function initFirebase() {
  if (!session.configured) {
    session.ready = true;
    emit();
    return;
  }
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    // Lưu tạm trên máy để trọng tài bấm điểm được khi mạng chập chờn.
    const db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
    });
    const auth = authMod.getAuth(app);
    auth.languageCode = 'vi';
    fb = { app, db, auth, appMod, authMod, fsMod };

    authMod.onAuthStateChanged(auth, async (user) => {
      session.user = user
        ? {
          uid: user.uid,
          name: user.displayName || (isAccountEmail(user.email) ? emailToUsername(user.email) : user.email),
          email: user.email,
          username: isAccountEmail(user.email) ? emailToUsername(user.email) : null,
          photo: user.photoURL,
        }
        : null;
      session.role = user ? await resolveRole(user) : 'guest';
      session.ready = true;
      emit();
    });
  } catch (err) {
    console.error(err);
    session.error = `Không kết nối được Firebase: ${err.message}`;
    session.ready = true;
    emit();
  }
}

async function resolveRole(user) {
  if (user.email === ADMIN_EMAIL && user.emailVerified) return 'admin';
  const { doc, getDoc, setDoc, serverTimestamp } = fb.fsMod;
  try {
    const snap = await getDoc(doc(fb.db, 'roles', user.uid));
    if (snap.exists()) return snap.data().role;
    // Người mới: ghi vào danh sách chờ để ban tổ chức duyệt.
    await setDoc(doc(fb.db, 'pendingRoles', user.uid), {
      email: user.email,
      name: user.displayName || user.email,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
  }
  return 'pending';
}

export async function signIn() {
  if (!fb) return;
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = fb.authMod;
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(fb.auth, provider);
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-environment') {
      await signInWithRedirect(fb.auth, provider);
    } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      alert(`Đăng nhập không thành công: ${err.message}`);
    }
  }
}

// Đăng nhập bằng tên đăng nhập và mật khẩu do ban tổ chức cấp. Trả về chuỗi lỗi hoặc null.
export async function signInWithAccount(username, password) {
  if (!fb) return 'Chưa kết nối Firebase.';
  try {
    await fb.authMod.signInWithEmailAndPassword(fb.auth, usernameToEmail(username), password);
    return null;
  } catch (err) {
    return authErrorText(err.code);
  }
}

// Ban tổ chức tạo tài khoản cho người khác. Dùng một bản Firebase phụ, không lưu phiên,
// để việc tạo tài khoản không làm ban tổ chức bị đăng xuất. Trả về { uid } hoặc { error }.
export async function createManagedAccount({ username, password, name, role }) {
  if (!fb) return { error: 'Chưa kết nối Firebase.' };
  const { appMod, authMod, fsMod } = fb;
  let secondary;
  try {
    secondary = appMod.initializeApp(firebaseConfig, `accounts-${Date.now()}`);
    const auth2 = authMod.initializeAuth(secondary, { persistence: authMod.inMemoryPersistence });
    const email = usernameToEmail(username);
    const cred = await authMod.createUserWithEmailAndPassword(auth2, email, password);
    await authMod.updateProfile(cred.user, { displayName: name });
    await fsMod.setDoc(fsMod.doc(fb.db, 'roles', cred.user.uid), {
      role, name, email, username, court: null, createdBy: session.user?.uid || null, createdVia: 'password',
    });
    await authMod.signOut(auth2);
    return { uid: cred.user.uid };
  } catch (err) {
    return { error: authErrorText(err.code) };
  } finally {
    if (secondary) appMod.deleteApp(secondary).catch(() => {});
  }
}

// Người dùng tự đổi mật khẩu của mình (chỉ với tài khoản tên đăng nhập). Trả về chuỗi lỗi hoặc null.
export async function changeMyPassword(currentPassword, newPassword) {
  if (!fb?.auth.currentUser) return 'Bạn chưa đăng nhập.';
  const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = fb.authMod;
  const user = fb.auth.currentUser;
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    await updatePassword(user, newPassword);
    return null;
  } catch (err) {
    return authErrorText(err.code);
  }
}

export async function signOutUser() {
  if (fb) await fb.authMod.signOut(fb.auth);
}

// Truy cập Firestore cho các trang: trả về db cùng các hàm của SDK, hoặc null ở chế độ xem thử.
export function firestore() {
  return fb ? { db: fb.db, ...fb.fsMod } : null;
}
