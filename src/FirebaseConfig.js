
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, remove, get, update, push } from "firebase/database";

const firebaseConfig = {
  databaseURL: "https://gsm-pl-b0b33-default-rtdb.europe-west1.firebasedatabase.app/",
  apiKey: "AIzaSyCW5FseFHkyBx4TtIXyEQEVSJZqLYNZQDw",
  authDomain: "gsm-pl-b0b33.firebaseapp.com",
  projectId: "gsm-pl-b0b33",
  storageBucket: "gsm-pl-b0b33.firebasestorage.app",
  messagingSenderId: "102321735193",
  appId: "1:102321735193:web:e4020df6791144c5518c88",
  measurementId: "G-MKR7KNRYR3"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database, get, ref, set, onValue, remove, update, push };

