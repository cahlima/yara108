/* eslint-disable @typescript-eslint/no-var-requires */
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

// --- CONFIGURAÇÃO ---
// ATENÇÃO: COLOQUE AQUI O SEU SERVICE ACCOUNT KEY
const serviceAccount = require("../serviceAccountKey.json");

// ATENÇÃO: DEFINA O UID DO SEU USUÁRIO DE TESTE
// Este UID será usado para definir o `ownerId` dos dados de teste.
const SEED_USER_ID = "XZfJtDAalldUWLHy5DF5tuWqSur1";

// --- INICIALIZAÇÃO DO FIREBASE ADMIN ---

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("Firebase Admin SDK inicializado com sucesso.");
} catch (error) {
  if (error.code === 'app/duplicate-app') {
    console.log("Firebase Admin SDK já inicializado.");
  } else {
    console.error("Erro ao inicializar Firebase Admin SDK:", error);
    process.exit(1);
  }
}

const db = getFirestore();

// --- DADOS PARA SEED ---

const customers = [
  { name: "Tony Stark" },
  { name: "Steve Rogers" },
  { name: "Thor Odinson" },
  { name: "Bruce Banner" },
  { name: "Natasha Romanoff" },
];

const products = [
  { name: "Pão Francês", price: 0.50, active: true },
  { name: "Café Expresso", price: 2.50, active: true },
  { name: "Coca-Cola Lata", price: 4.00, active: true },
  { name: "Salgado (Coxinha)", price: 5.00, active: true },
  { name: "Bolo de Chocolate (fatia)", price: 7.00, active: true },
  { name: "Produto Inativo", price: 10.00, active: false },
];

// --- FUNÇÕES DE APOIO ---

/**
 * Apaga todos os documentos de uma coleção que pertencem a um `ownerId`.
 */
async function deleteByOwnerId(collectionName, ownerId) {
  console.log(`Limpando coleção "${collectionName}" para o ownerId: ${ownerId}...`);
  const querySnapshot = await db.collection(collectionName).where("ownerId", "==", ownerId).get();
  if (querySnapshot.empty) {
    console.log(` -> Nenhum documento encontrado em "${collectionName}" para este owner.`);
    return;
  }
  const batch = db.batch();
  querySnapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  console.log(` -> ${querySnapshot.size} documentos apagados de "${collectionName}".`);
}

/**
 * Apaga todos os documentos de uma coleção, independentemente do dono.
 * Usado para coleções globais como 'products'.
 */
async function deleteAllFromCollection(collectionName) {
  console.log(`Limpando TODA a coleção "${collectionName}"...`);
  const querySnapshot = await db.collection(collectionName).limit(500).get(); // Limite para segurança
  if (querySnapshot.empty) {
    console.log(` -> Nenhum documento encontrado em "${collectionName}".`);
    return;
  }
  const batch = db.batch();
  querySnapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  console.log(` -> ${querySnapshot.size} documentos apagados de "${collectionName}".`);
}


/**
 * Popula uma coleção com dados, adicionando um `ownerId` se aplicável.
 */
async function seed(collectionName, data, ownerId) {
  console.log(`Populando coleção "${collectionName}"...`);
  const batch = db.batch();
  data.forEach(item => {
    const docRef = db.collection(collectionName).doc();
    
    // Adiciona ownerId apenas para coleções que não sejam 'products'
    const dataWithOwner = collectionName !== 'products' 
      ? { ...item, ownerId } 
      : item;

    batch.set(docRef, dataWithOwner);
  });
  await batch.commit();
  console.log(` -> ${data.length} documentos criados em "${collectionName}".`);
}


// --- FUNÇÃO PRINCIPAL ---

async function main() {
  console.log("--- INICIANDO PROCESSO DE RESET E SEED ---");

  if (!SEED_USER_ID) {
    console.error("❌ Erro: A variável 'SEED_USER_ID' não está definida no script.");
    console.error("Ação: Defina o UID do seu usuário de teste para continuar.");
    return;
  }

  try {
    // --- Limpeza ---
    await deleteByOwnerId("customers", SEED_USER_ID);
    await deleteByOwnerId("consumption_records", SEED_USER_ID);
    await deleteByOwnerId("invoices", SEED_USER_ID);
    
    // Usar a função de limpeza global para coleções não pertencentes a usuários
    await deleteAllFromCollection("products");
    await deleteAllFromCollection("day_products");

    // --- Seed ---
    await seed("customers", customers, SEED_USER_ID);
    await seed("products", products, null); // ownerId é null para produtos

    console.log("\n✅ Processo concluído com sucesso!");

  } catch (error) {
    console.error("\n❌ Ocorreu um erro durante o processo:", error);
  } finally {
    // Encerra a aplicação do admin para o script finalizar corretamente.
    console.log('\nEncerrando conexão com o Admin SDK...');
    await admin.app().delete();
    console.log('Conexão encerrada.');
  }
}

// Executa a função principal
main();
