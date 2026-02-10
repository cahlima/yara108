
import * as admin from 'firebase-admin';

// Use a variável de ambiente para as credenciais em produção
// Para desenvolvimento local, o SDK pode buscar automaticamente se GOOGLE_APPLICATION_CREDENTIALS estiver setado
// ou se você inicializar com o serviceAccount.
const serviceAccount = require('../../secrets/serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
