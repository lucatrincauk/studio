
'use client';

import type { User as FirebaseUser, AuthError } from 'firebase/auth';
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
import { useRouter } from 'next/navigation'; // Import useRouter

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
  updateUserProfile: (newName: string) => Promise<boolean>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const updateUserProfileInFirestore = async (user: FirebaseUser) => {
  if (!user) return;
  const userProfileRef = doc(db, USER_PROFILES_COLLECTION, user.uid);
  
  // Fetch existing profile to avoid overwriting fields like 'name' if it was set manually
  let profileDataToSave;
  try {
    const profileSnap = await getDoc(userProfileRef);
    if (profileSnap.exists()) {
      profileDataToSave = { // Merge with existing data
        ...profileSnap.data(),
        uid: user.uid, // Ensure UID is present
        email: user.email, // Update email
        photoURL: user.photoURL, // Update photoURL
        // name is preserved if already set, or set to default below if not
      };
       if (!profileDataToSave.name && user.displayName) {
        profileDataToSave.name = user.displayName;
      } else if (!profileDataToSave.name) {
        profileDataToSave.name = user.email?.split('@')[0] || 'Utente Anonimo';
      }
    } else { // New profile
      profileDataToSave = {
        uid: user.uid,
        email: user.email,
        name: user.displayName || user.email?.split('@')[0] || 'Utente Anonimo',
        photoURL: user.photoURL,
      };
    }
  } catch (firestoreError) {
    // If fetching existing profile fails, proceed with basic data
    profileDataToSave = {
      uid: user.uid,
      email: user.email,
      name: user.displayName || user.email?.split('@')[0] || 'Utente Anonimo',
      photoURL: user.photoURL,
    };
  }

  try {
    await setDoc(userProfileRef, profileDataToSave, { merge: true });
  } catch (firestoreError) {
    console.error("Error updating user profile in Firestore:", firestoreError);
  }
};


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter(); // Initialize useRouter

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setIsAdmin(firebaseUser.email === ADMIN_EMAIL);
        await updateUserProfileInFirestore(firebaseUser);
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
        router.push(redirectPath || '/'); // Redirect after sign up
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
        router.push(redirectPath || '/'); // Redirect after sign in
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
        router.push(redirectPath || '/'); // Redirect after Google sign in
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
      router.push('/'); // Redirect to home on sign out
    } catch (e) {
      setError(e as AuthError);
    } finally {
      setLoading(false);
    }
  };

  const updateUserProfileAuth = async (newName: string): Promise<boolean> => {
    if (!auth.currentUser) {
      const noUserError = { code: 'auth/no-current-user', message: 'Nessun utente attualmente loggato per aggiornare il profilo.' } as AuthError;
      setError(noUserError);
      toast({ title: "Errore", description: noUserError.message, variant: "destructive" });
      return false;
    }

    setError(null);
    try {
      await firebaseUpdateProfile(auth.currentUser, { displayName: newName });
      const updatedUser = { ...auth.currentUser } as FirebaseUser; 
      setUser(updatedUser); 
      await updateUserProfileInFirestore(updatedUser); 
      toast({ title: "Profilo Aggiornato", description: "Il tuo nome visualizzato è stato aggiornato con successo." });
      return true;
    } catch (e) {
      const updateError = e as AuthError;
      setError(updateError);
      toast({ title: "Errore Aggiornamento Profilo", description: updateError.message, variant: "destructive" });
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
