
import * as admin from 'firebase-admin';

// Evita a reinicialização do app se o script for chamado múltiplas vezes.
if (!admin.apps.length) {
  try {
    let credential;
    // 1. Tenta usar a variável de ambiente com o JSON da service account
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      credential = admin.credential.cert(serviceAccount);
    } 
    // 2. Se não, delega para o SDK procurar GOOGLE_APPLICATION_CREDENTIALS ou outras fontes padrão.
    else {
      credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({
      credential,
    });
    console.log("Firebase Admin SDK inicializado com sucesso.");

  } catch (error) {
    console.error("Erro ao inicializar Firebase Admin SDK:", error);
    process.exit(1);
  }
}

export const adminDb = admin.firestore();
