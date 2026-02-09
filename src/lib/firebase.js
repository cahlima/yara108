// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCL4vz6kMIX_neZwZ6kSHGdKsVSwzNwDH0",
    authDomain: "yara108-b7b92.firebaseapp.com",
    projectId: "yara108-b7b92",
    storageBucket: "yara108-b7b92.appspot.com",
    messagingSenderId: "828298841802",
    appId: "1:828298841802:web:09099f302e8cdc0b006e33"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Connect to the default Firestore database
const db = getFirestore(app);
const auth = getAuth(app);
export { db, app, auth };
