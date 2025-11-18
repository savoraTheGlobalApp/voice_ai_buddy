import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Verify admin code from Firestore
 * The admin code should be stored in Firestore at: config/adminCode
 * Document structure: { code: "your-admin-code-here" }
 */
export async function verifyAdminCode(enteredCode: string): Promise<boolean> {
  try {
    const adminDocRef = doc(db, 'config', 'adminCode');
    const adminDoc = await getDoc(adminDocRef);
    
    if (!adminDoc.exists()) {
      console.warn('Admin code document does not exist in Firestore');
      return false;
    }
    
    const adminData = adminDoc.data();
    const correctCode = adminData?.code;
    
    if (!correctCode) {
      console.warn('Admin code not found in Firestore document');
      return false;
    }
    
    return enteredCode.trim() === correctCode.trim();
  } catch (error) {
    console.error('Error verifying admin code:', error);
    return false;
  }
}

