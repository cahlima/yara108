const admin = require('firebase-admin');

// --- CONFIGURAÇÃO ---
// O e-mail do usuário que você quer tornar administrador.
const USER_EMAIL_TO_MAKE_ADMIN = 'caciabad@gmail.com';

/**
 * Inicializa o Firebase Admin SDK.
 * Ele tentará usar as credenciais padrão da aplicação (GOOGLE_APPLICATION_CREDENTIALS).
 * Certifique-se de que a variável de ambiente GOOGLE_APPLICATION_CREDENTIALS
 * esteja apontando para o seu arquivo serviceAccountKey.json.
 * 
 * Como configurar a variável de ambiente no seu terminal:
 * (Apenas para a sessão atual do terminal)
 * export GOOGLE_APPLICATION_CREDENTIALS="/caminho/completo/para/seu/serviceAccountKey.json"
 * 
 * Ou coloque no seu .bashrc ou .zshrc para ser permanente.
 */
try {
  admin.initializeApp();
  console.log('Firebase Admin SDK inicializado com sucesso.');
} catch (error) {
  if (error.code === 'app/duplicate-app') {
    // App já inicializado, o que é esperado em alguns ambientes.
    console.log('Firebase Admin SDK já estava inicializado.');
  } else {
    console.error('Falha ao inicializar o Firebase Admin SDK.', error);
    console.error('\nCertifique-se de que a variável de ambiente GOOGLE_APPLICATION_CREDENTIALS está configurada corretamente.');
    process.exit(1);
  }
}

/**
 * Define o custom claim `admin: true` para o usuário especificado.
 */
async function setAdminClaim() {
  try {
    console.log(`Procurando usuário pelo e-mail: ${USER_EMAIL_TO_MAKE_ADMIN}...`);
    const user = await admin.auth().getUserByEmail(USER_EMAIL_TO_MAKE_ADMIN);

    // Pega os claims existentes para não sobrescrevê-los
    const existingClaims = user.customClaims || {};

    if (existingClaims.admin === true) {
      console.log(`O usuário ${USER_EMAIL_TO_MAKE_ADMIN} (UID: ${user.uid}) já possui a permissão de administrador.`);
      return;
    }

    console.log(`Definindo a permissão de administrador para o usuário (UID: ${user.uid})...`);
    await admin.auth().setCustomUserClaims(user.uid, { ...existingClaims, admin: true });

    console.log(`\n✅ Sucesso! O usuário ${USER_EMAIL_TO_MAKE_ADMIN} agora é um administrador.`);
    console.log('IMPORTANTE: Para que a permissão tenha efeito, o usuário precisa fazer logout e login novamente no aplicativo.');

  } catch (error) {
    console.error(`\n❌ Erro ao tentar definir a permissão de administrador para ${USER_EMAIL_TO_MAKE_ADMIN}.`);
    if (error.code === 'auth/user-not-found') {
      console.error('Causa: O usuário com este e-mail não foi encontrado no Firebase Authentication.');
      console.error('Ação: Verifique se o e-mail está correto e se o usuário já se cadastrou no sistema.');
    } else {
      console.error('Causa: ', error.message);
    }
  } finally {
    // Encerra a aplicação do admin para o script finalizar corretamente.
    admin.app().delete().then(() => {
        console.log('\nConexão com o Admin SDK encerrada.');
    });
  }
}

// Executa a função principal
setAdminClaim();
