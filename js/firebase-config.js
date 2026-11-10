// =====================================================================
//  CONFIGURAÇÃO DO FIREBASE
//  1) No console do Firebase: Configurações do projeto > Seus apps > Web (</>)
//  2) Copie o objeto "firebaseConfig" e cole abaixo, no lugar dos COLE_AQUI.
// =====================================================================
export const firebaseConfig = {
  apiKey: 'AIzaSyC7n6Aqvvo2PYRdZXbvAXeoM2xqGZvIf5U',
  authDomain: 'pizzaria-site-ad43a.firebaseapp.com',
  projectId: 'pizzaria-site-ad43a',
  storageBucket: 'pizzaria-site-ad43a.firebasestorage.app',
  messagingSenderId: '840951515909',
  appId: '1:840951515909:web:948e06a629455fc804056c',
};

// ---------------------------------------------------------------------
//  Daqui pra baixo não precisa mexer.
//  A versão do SDK fica fixa aqui (e em js/admin.js, no import do Auth).
// ---------------------------------------------------------------------
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Reexporta todas as funções do Firestore para os outros arquivos
// importarem daqui (assim a versão do SDK fica num lugar só).
export * from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const configurado = !String(firebaseConfig.apiKey).startsWith('COLE');

export const app = initializeApp(firebaseConfig);

// Cache local (IndexedDB): o cardápio abre instantâneo nas próximas visitas.
let banco;
try {
  banco = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  console.warn('Cache local indisponível, usando memória.', e);
  banco = getFirestore(app);
}
export const db = banco;
