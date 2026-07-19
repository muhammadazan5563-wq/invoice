import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Google Sheets scope and user info scopes
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/userinfo.email');
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

const TOKEN_STORAGE_KEY = 'invoice_firebase_token';
const USER_STORAGE_KEY = 'invoice_firebase_user';

// Store token in localStorage for persistence
function persistToken(token: string) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch (e) {
    console.warn('Failed to persist token:', e);
  }
}

// Get persisted token from localStorage
function getPersistedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

// Clear persisted token
function clearPersistedToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear persisted token:', e);
  }
}

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess: (user: User, token: string) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      // First check if we have a cached token from the current session
      if (cachedAccessToken) {
        onAuthSuccess(user, cachedAccessToken);
        return;
      }

      // Try to get persisted token from localStorage
      const persistedToken = getPersistedToken();
      if (persistedToken) {
        cachedAccessToken = persistedToken;
        onAuthSuccess(user, persistedToken);
        return;
      }

      // If we have a Firebase user but no token, try to get a fresh ID token
      // This won't give us the Google OAuth access token, but at least keeps the session
      try {
        const idToken = await user.getIdToken(true);
        if (idToken) {
          cachedAccessToken = idToken;
          persistToken(idToken);
          onAuthSuccess(user, idToken);
          return;
        }
      } catch (e) {
        console.warn('Failed to refresh token:', e);
      }

      // If all else fails, require re-login
      onAuthFailure();
    } else {
      cachedAccessToken = null;
      clearPersistedToken();
      onAuthFailure();
    }
  });
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    persistToken(credential.accessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  clearPersistedToken();
};
