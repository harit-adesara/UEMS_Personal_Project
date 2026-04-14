import admin from "firebase-admin";
import serviceAccount from "C:/Users/ronak/Downloads/uems-677d9-firebase-adminsdk-fbsvc-e60b35d1e7.json";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export { admin };
