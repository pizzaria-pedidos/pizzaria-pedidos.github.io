// Versão de teste do firebase-config.js apontando para os emuladores locais.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
export * from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
export const configurado = true;
export const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-pizzaria', authDomain: 'demo-pizzaria.firebaseapp.com', appId: 'demo' });
export const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
