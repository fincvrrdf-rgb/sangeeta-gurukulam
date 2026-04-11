/**
 * Emergency script to re-enable the super admin Firebase account.
 * Run with: node scripts/recover-superadmin.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const SUPER_ADMIN_EMAIL = 'sangeetagurukulam0@gmail.com';

const app = initializeApp({
  credential: cert({
    projectId: 'sangeetagurukulam-b4ccb',
    clientEmail: 'firebase-adminsdk-fbsvc@sangeetagurukulam-b4ccb.iam.gserviceaccount.com',
    privateKey: `-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDZi5H/5fTDn2oz\nDGIv6CSidJHmJRJvBXBPLihFml+FEkISEdLERs46gCUDp437S8G6y7Q43CMl1ON0\no904GFJbSmLUEVgGsIXDKI3hdOrB7k3AgBjcfkvFviVCBjWO7cvq3xfCaQ3lUd05\nap3gk10S1b1iSkSxH7KI8vSltQftRzqH37L3sWYvsHkf/3TNaYr1hLy8j2fTRqWN\nYme6FVii+k0J4iPOKGYKwmabm0QlHbFQo1cL4Lm4YNreQw0DlelfQrA62icdcRdP\nV81emCeCp6TBCtc/GyTA0U6s57uTWheP7ITKTRu8Eug4Sj87js5ZW1DJjNgRbJ8+\n+j/MQpetAgMBAAECggEACyzCurDu0k+xjl6/+nMD0r6HMhnMaRyP6NlXoz+rUXQf\nJbt5prB2boXfoODuB68cDALjxpn0SkC10GuMdRG2xU68ZeVgLrPJoz1FkIPHfV/G\n6bEK1eS88rLySgJ0pNttQqrkFw37c0Cxyv3Bj2Qyf0GwgUiMX8bfjm5gh9SVTCho\nw0hWZ+VgHHe4W7iQIARFdvM8+GzbnnKOTfXlHdMl7CpUrWdan41nSB4vH5lBsB0i\nbQh38lw9k0W6t7NLPkvuKHEIMzsgpYzl4KtuOwrWqd+iJz5UYdOZv6zgPisveLlj\n6n958u8BF/cYMMWtPklPUfeKgvQ9xL6BxgLLFLwU5wKBgQD1bcWli8XR+PmLu8e8\n6+gFd2V11wjOQMyrjOqQBB7pPAZywGK0ea4CL4eueS1B5P68+ijV7FXEjQelud79\nfan+4GhlNcp0O/wSBWhRowinW5G1RF523Njc+88UF8ZawYNmqeuJyqJHEgnuGyGg\n77zTCMmQJO/h5G8G2VuV2I8v6wKBgQDi6lbCPCTDVaOWZv/M0yRBdHy9gwZPtfm1\n0+Q8kMuam+XCM5hMjBoORJcOO2tJlsksrFbq6Z0jD35RSJYtcHbQCsvLx3qzebsG\nKH2xJ7obdINl251i613NZRINVVXgH4cGYTPIDnYXsuE7hXZVX5ZkxA0/osTUVmnN\nvXHeCh8IxwKBgQDlamgfmCkhXnd+C9jomyf2vCXmYkyD6ASps36rgn6WjJqGd5mM\nlFV5C47sI6+PcgxBACJd3Z5KrX3hh36PPAFFE+Xh/ccyocO94Loj3Z9AOZNZewBG\nYaiB4Qwv/w1WVp+KvvlCg1zvzEfmAAyOUKsUJZmsmSp24L58C3/V8WnfYwKBgQCG\nctDrD1W9A04FPIwOIYCW491RMIQZ0LnfOWg/Vo+80OhGs+lmWZDKqWtTPHOqS5Rx\nSr/JOpgngPOYV8jbrYpIZE0yNcSG+PaOhIlM4TwNLnD4djJ/vPN8UolqqwhR3nxT\nlF5pB+CC1DNN4BsoJJXoqJ0s+lVjdrwD8l64cAjJWwKBgQCnJ6I2BWfMEqtbKMNJ\nVnzqssYZ5ztnLwSUFSABmC3YgnCo7bqSH9gPw1nfMQ5J/YkrL5Ubti4J+l3U282g\nl7SNw1EYB/rX9b6P4RfLCCvJqa046/v9f/iRB+xt49shS5VW1pPQk7ZvH7Ugjbq/\nKdaCnsWgKiHo2mm7vjjqmbGhJQ==\n-----END PRIVATE KEY-----\n`,
  }),
});

const auth = getAuth(app);
const db = getFirestore(app);

async function recover() {
  console.log(`Looking up ${SUPER_ADMIN_EMAIL}...`);
  const user = await auth.getUserByEmail(SUPER_ADMIN_EMAIL);
  console.log(`Found UID: ${user.uid}, disabled: ${user.disabled}`);

  // Re-enable account
  await auth.updateUser(user.uid, { disabled: false });
  console.log('Firebase Auth account re-enabled.');

  // Restore super_admin claim
  await auth.setCustomUserClaims(user.uid, { role: 'super_admin' });
  console.log('Custom claim role=super_admin restored.');

  // Restore Firestore user document
  await db.collection('users').doc(user.uid).set({
    isActive: true,
    role: 'super_admin',
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  console.log('Firestore user document restored.');

  console.log('\nDone! Sign in at your app with sangeetagurukulam0@gmail.com');
}

recover().catch((err) => {
  console.error('Recovery failed:', err.message);
  process.exit(1);
});
