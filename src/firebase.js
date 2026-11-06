import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Copy the firebaseConfig object from Firebase Console > Project settings > Your apps.
const firebaseConfig = {
  apiKey: "AIzaSyD5p1aQJk2_8MjAKoN65G5Cv5nDlObbzvE",
  authDomain: "cse-allied-timetable.firebaseapp.com",
  projectId: "cse-allied-timetable",
  storageBucket: "cse-allied-timetable.firebasestorage.app",
  messagingSenderId: "965989798843",
  appId: "1:965989798843:web:3129a42d38be6c7c23ea9e",
  measurementId: "G-R0JFS00M02"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
