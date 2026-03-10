
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, remove, get, update, push, child } from "firebase/database";

// const firebaseConfig = {
//   databaseURL: "https://gsm-pl-b0b33-default-rtdb.europe-west1.firebasedatabase.app/",
//   apiKey: "AIzaSyCW5FseFHkyBx4TtIXyEQEVSJZqLYNZQDw",
//   authDomain: "gsm-pl-b0b33.firebaseapp.com",
//   projectId: "gsm-pl-b0b33",
//   storageBucket: "gsm-pl-b0b33.firebasestorage.app",
//   messagingSenderId: "102321735193",
//   appId: "1:102321735193:web:e4020df6791144c5518c88",
//   measurementId: "G-MKR7KNRYR3"
// };
const firebaseConfig = {
  databaseURL: "https://flotaexon-default-rtdb.europe-west1.firebasedatabase.app/",
  apiKey: "AIzaSyBoBCFW7jU3EJUhyAHacjTnAES9Kp7Srpw",
  authDomain: "flotaexon.firebaseapp.com",
  databaseURL: "https://flotaexon-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "flotaexon",
  storageBucket: "flotaexon.firebasestorage.app",
  messagingSenderId: "167262348105",
  appId: "1:167262348105:web:c95a01a9060811682ff098",
  measurementId: "G-H3PMZ2M250"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database, get, ref, set, onValue, remove, update, push, child };

