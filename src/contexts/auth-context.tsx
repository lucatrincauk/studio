
'use client';

import type { User as FirebaseUser, AuthError } from 'firebase/auth';
import type { UserProfile } from '@/lib/types'; // Import UserProfile
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile as firebaseUpdateProfile,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation'; 

const ADMIN_EMAIL = "lucatrinca.uk@gmail.com";
const USER_PROFILES_COLLECTION = 'user_profiles';

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  error: AuthError | null;
  isAdmin: boolean;
  signUp: (email: string, pass: string, redirectPath?: string | null) => Promise<FirebaseUser | null>;
  signIn: (email: string, pass: string, redirectPath?: string | null) => Promise<FirebaseUser | null>;
  signInWithGoogle: (redirectPath?: string | null) => Promise<FirebaseUser | null>;
  signOut: () => Promise<void>;
  updateUserProfile: (updates: { displayName?: string; bggUsername?: string | null }) => Promise<boolean>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const updateUserProfileInFirestore = async (user: FirebaseUser) => {
  if (!user) return;
  const userProfileRef = doc(db, USER_PROFILES_COLLECTION, user.uid);
  
  let profileDataToSave: Partial<UserProfile> = {
    uid: user.uid, // Firestore UserProfile uses 'id', but we're saving uid here
    email: user.email,
    photoURL: user.photoURL,
    // name will be set based on displayName or email
  };

  try {
    const profileSnap = await getDoc(userProfileRef);
    if (profileSnap.exists()) {
      const existingData = profileSnap.data() as UserProfile;
      profileDataToSave.name = user.displayName || existingData.name || user.email?.split('@')[0] || 'Utente Anonimo';
      // Preserve existing bggUsername if not explicitly being overwritten now (which it isn't in this helper)
      profileDataToSave.bggUsername = existingData.bggUsername === "" ? null : (existingData.bggUsername || null);
    } else { // New profile
      profileDataToSave.name = user.displayName || user.email?.split('@')[0] || 'Utente Anonimo';
      profileDataToSave.bggUsername = null; // Default for new profiles
    }
    await setDoc(userProfileRef, profileDataToSave, { merge: true });
  } catch (firestoreError) {
    console.error("Error updating user profile in Firestore during initial setup/login:", firestoreError);
    // Fallback if getDoc fails, ensure basic data is attempted
    if (!profileDataToSave.name) {
       profileDataToSave.name = user.displayName || user.email?.split('@')[0] || 'Utente Anonimo';
    }
    if (typeof profileDataToSave.bggUsername === 'undefined') { // ensure it's set even on fallback
       profileDataToSave.bggUsername = null;
    }
    try {
      // Attempt to save again with minimal data if getDoc failed
      await setDoc(userProfileRef, profileDataToSave, { merge: true });
    } catch (nestedError) {
      console.error("Nested error during Firestore profile update fallback:", nestedError);
    }
  }
};


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter(); 

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setIsAdmin(firebaseUser.email === ADMIN_EMAIL);
        await updateUserProfileInFirestore(firebaseUser); // Ensures profile exists/is updated on login
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const clearError = () => setError(null);

  const signUp = async (email: string, pass: string, redirectPath?: string | null): Promise<FirebaseUser | null> => {
    setLoading(true);
    setError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const newUser = userCredential.user;
      if (!newUser.displayName && newUser.email) {
        const displayNameFromEmail = newUser.email.split('@')[0];
        await firebaseUpdateProfile(newUser, { displayName: displayNameFromEmail });
        await newUser.reload(); 
      }
      setUser(auth.currentUser); 
      setIsAdmin(auth.currentUser?.email === ADMIN_EMAIL);
      if (auth.currentUser) {
        await updateUserProfileInFirestore(auth.currentUser); 
        router.push(redirectPath || '/'); 
      }
      return auth.currentUser;
    } catch (e) {
      setError(e as AuthError);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, pass: string, redirectPath?: string | null): Promise<FirebaseUser | null> => {
    setLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      setUser(userCredential.user);
      setIsAdmin(userCredential.user.email === ADMIN_EMAIL);
      await updateUserProfileInFirestore(userCredential.user); 
      if (userCredential.user) {
        router.push(redirectPath || '/'); 
      }
      return userCredential.user;
    } catch (e) {
      setError(e as AuthError);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async (redirectPath?: string | null): Promise<FirebaseUser | null> => {
    setLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      setIsAdmin(result.user.email === ADMIN_EMAIL);
      await updateUserProfileInFirestore(result.user); 
      if (result.user) {
        router.push(redirectPath || '/'); 
      }
      return result.user;
    } catch (e) {
      setError(e as AuthError);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signOutFunc = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setIsAdmin(false);
      router.push('/'); 
    } catch (e) {
      setError(e as AuthError);
    } finally {
      setLoading(false);
    }
  };

  const updateUserProfileAuth = async (updates: { displayName?: string; bggUsername?: string | null }): Promise<boolean> => {
    if (!auth.currentUser) {
      const noUserError = { code: 'auth/no-current-user', message: 'Nessun utente attualmente loggato per aggiornare il profilo.' } as AuthError;
      setError(noUserError);
      toast({ title: "Errore", description: noUserError.message, variant: "destructive" });
      return false;
    }

    setError(null);
    const firestoreUpdatePayload: { name?: string; bggUsername?: string | null } = {};
    let authProfileUpdated = false;

    if (typeof updates.displayName === 'string' && updates.displayName !== auth.currentUser.displayName) {
      try {
        await firebaseUpdateProfile(auth.currentUser, { displayName: updates.displayName });
        authProfileUpdated = true;
        // Prepare name for Firestore update
        firestoreUpdatePayload.name = updates.displayName;
      } catch (e) {
        const updateError = e as AuthError;
        setError(updateError);
        toast({ title: "Errore Aggiornamento Nome Visualizzato", description: updateError.message, variant: "destructive" });
        return false;
      }
    } else if (updates.displayName) { // If same name is submitted, still ensure it's in Firestore payload
        firestoreUpdatePayload.name = updates.displayName;
    } else if (auth.currentUser.displayName) { // If displayName not in updates, use current auth one
        firestoreUpdatePayload.name = auth.currentUser.displayName;
    }


    if (typeof updates.bggUsername !== 'undefined') {
      firestoreUpdatePayload.bggUsername = updates.bggUsername === "" ? null : updates.bggUsername;
    }
    
    try {
      const userProfileRef = doc(db, USER_PROFILES_COLLECTION, auth.currentUser.uid);
      await setDoc(userProfileRef, firestoreUpdatePayload, { merge: true });
      
      if (authProfileUpdated && auth.currentUser) {
         await auth.currentUser.reload(); 
         const reloadedUser = auth.currentUser; // get the latest instance
         setUser(reloadedUser ? { ...reloadedUser } : null);
      }
      toast({ title: "Profilo Aggiornato", description: "Il tuo profilo è stato aggiornato con successo." });
      return true;
    } catch (e) {
      const firestoreError = e as AuthError; 
      setError({ name: "FirestoreError", message: firestoreError.message || "Errore durante l'aggiornamento del profilo su Firestore.", code: "firestore-error"} as AuthError);
      toast({ title: "Errore Aggiornamento Profilo", description: firestoreError.message, variant: "destructive" });
      return false;
    }
  };

  const value = {
    user,
    loading,
    error,
    isAdmin,
    signUp,
    signIn,
    signInWithGoogle,
    signOut: signOutFunc,
    updateUserProfile: updateUserProfileAuth,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
