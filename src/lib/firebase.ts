import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBwtFYfgYzDr9zxZxjQCkzhbI_2Dxmnle8",
  authDomain: "vernox-1b5d5.firebaseapp.com",
  projectId: "vernox-1b5d5",
  storageBucket: "vernox-1b5d5.firebasestorage.app",
  messagingSenderId: "595354584631",
  appId: "1:595354584631:web:8c845d5c5bc3568437e1b2",
  measurementId: "G-RH25QZ3N16"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Connect to local Firestore emulator when enabled (safe across browser and Node build contexts)
const useEmulator = 
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_USE_FIREBASE_EMULATOR === 'true') ||
  (typeof process !== 'undefined' && process.env && (process.env.VITE_USE_FIREBASE_EMULATOR === 'true' || !!process.env.FIRESTORE_EMULATOR_HOST));

if (useEmulator) {
  const host = 
    (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_FIREBASE_EMULATOR_HOST) ||
    (typeof process !== 'undefined' && process.env?.VITE_FIREBASE_EMULATOR_HOST) ||
    'localhost';
  // Ports match firebase.json "emulators"; `npm run dev:local` starts them with seeded data.
  connectFirestoreEmulator(db, host, 8085);
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
}
