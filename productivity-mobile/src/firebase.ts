import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBgj9_6ltvaFO_xxfM1IFv4V2UcDsL9XN0',
  authDomain: 'productivity-963.firebaseapp.com',
  projectId: 'productivity-963',
  storageBucket: 'productivity-963.firebasestorage.app',
  messagingSenderId: '660869268366',
  appId: '1:660869268366:web:dc5c6d6d0e3aa3fc719adf',
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

const reactNativeAsyncStoragePersistence = class {
  static type = 'LOCAL';
  readonly type = 'LOCAL';

  async _isAvailable() {
    try {
      await AsyncStorage.setItem('__auth_test__', '1');
      await AsyncStorage.removeItem('__auth_test__');
      return true;
    } catch {
      return false;
    }
  }

  _set(key: string, value: unknown) {
    return AsyncStorage.setItem(key, JSON.stringify(value));
  }

  async _get<T>(key: string): Promise<T | null> {
    const value = await AsyncStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  _remove(key: string) {
    return AsyncStorage.removeItem(key);
  }

  _addListener() {
    // React Native AsyncStorage does not support auth key listeners.
  }

  _removeListener() {
    // React Native AsyncStorage does not support auth key listeners.
  }
};

let authInstance: Auth;
try {
  authInstance = initializeAuth(firebaseApp, {
    persistence: reactNativeAsyncStoragePersistence as never,
  });
} catch {
  // Fallback when Auth is already initialized (hot reload / fast refresh).
  authInstance = getAuth(firebaseApp);
}

export const auth = authInstance;
export const db = getFirestore(firebaseApp);
