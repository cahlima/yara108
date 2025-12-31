const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json'); // Caminho para sua chave de serviço

const userEmail = 'caciabad@gmail.com'; // Email do usuário para tornar admin

// Inicializa o Firebase Admin SDK
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK inicializado com sucesso.');
} catch (error) {
  if (error.code === 'app/duplicate-app') {
    console.log('Firebase Admin SDK já inicializado.');
  } else {
    console.error('Erro ao inicializar Firebase Admin SDK:', error);
    process.exit(1);
  }
}

async function setAdminClaim() {
  try {
    // Procura o usuário pelo email
    const user = await admin.auth().getUserByEmail(userEmail);
    
    // Define o custom claim { admin: true }
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    
    console.log(`Sucesso! O usuário ${userEmail} (UID: ${user.uid}) agora é um administrador.`);
    console.log('Para que a alteração tenha efeito, o usuário precisa sair e entrar novamente na aplicação.');

  } catch (error) {
    console.error(`Erro ao definir custom claim para ${userEmail}:`, error);
    if (error.code === 'auth/user-not-found') {
      console.error('Por favor, verifique se o email está correto e se o usuário existe no Firebase Authentication.');
    }
  } finally {
    // Encerra a conexão do app para que o script finalize
    admin.app().delete();
  }
}

// Executa a função
setAdminClaim();
