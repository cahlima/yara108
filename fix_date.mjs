import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyCL4vz6kMIX_neZwZ6kSHGdKsVSwzNwDH0",
  projectId: "yara108-b7b92",
  authDomain: "yara108-b7b92.firebaseapp.com",
});

const db = getFirestore(app);

const q = query(
  collection(db, 'consumption_records'),
  where('date', '==', '2026-03-05')
);

const snapshot = await getDocs(q);
console.log(`Encontrados: ${snapshot.size} registros`);
snapshot.forEach(d => console.log(d.id, d.data().customer_name, d.data().product_name, d.data().date));
process.exit(0);
