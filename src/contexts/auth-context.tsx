
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
import { auth, db } from '@/lib/firebase'; // Import db
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore'; // Import Firestore functions
import { toast } from '@/hooks/use-toast';

const ADMIN_EMAIL = "lucatrinca.uk@gmail.com";
const USER_PROFILES_COLLECTION = 'user_profiles';

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  error: AuthError | null;
  isAdmin: boolean;
  signUp: (email: string, pass: string) => Promise<FirebaseUser | null>;
  signIn: (email: string, pass: string) => Promise<FirebaseUser | null>;
  signInWithGoogle: () => Promise<FirebaseUser | null>;
  signOut: () => Promise<void>;
  updateUserProfile: (newName: string) => Promise<boolean>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to create or update user profile in Firestore
const updateUserProfileInFirestore = async (user: FirebaseUser) => {
  if (!user) return;
  const userProfileRef = doc(db, USER_PROFILES_COLLECTION, user.uid);
  const userProfileData = {
    uid: user.uid,
    email: user.email,
    name: user.displayName || user.email?.split('@')[0] || 'Utente Anonimo', // Use a default name
    photoURL: user.photoURL,
    // lastSeen: new Date().toISOString(), // Optional: track activity
  };

  try {
    // Use setDoc with merge:true to create or update
    await setDoc(userProfileRef, userProfileData, { merge: true });
  } catch (firestoreError) {
    console.error("Error updating user profile in Firestore:", firestoreError);
    // Optionally, handle this error (e.g., log to a service)
    // but don't block the auth flow for this.
  }
};


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setIsAdmin(firebaseUser.email === ADMIN_EMAIL);
        // Ensure profile exists or is updated on auth state change
        await updateUserProfileInFirestore(firebaseUser);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const clearError = () => setError(null);

  const signUp = async (email: string, pass: string): Promise<FirebaseUser | null> => {
    setLoading(true);
    setError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const newUser = userCredential.user;
      // Set a default display name if none exists, using the email prefix
      if (!newUser.displayName && newUser.email) {
        const displayNameFromEmail = newUser.email.split('@')[0];
        await firebaseUpdateProfile(newUser, { displayName: displayNameFromEmail });
        // Refresh user to get updated profile
        await newUser.reload();
      }
      setUser(auth.currentUser); // Update state with potentially reloaded user
      setIsAdmin(auth.currentUser?.email === ADMIN_EMAIL);
      if (auth.currentUser) {
        await updateUserProfileInFirestore(auth.currentUser);
      }
      return auth.currentUser;
    } catch (e) {
      setError(e as AuthError);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, pass: string): Promise<FirebaseUser | null> => {
    setLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      setUser(userCredential.user);
      setIsAdmin(userCredential.user.email === ADMIN_EMAIL);
      await updateUserProfileInFirestore(userCredential.user); // Update profile on sign-in
      return userCredential.user;
    } catch (e) {
      setError(e as AuthError);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async (): Promise<FirebaseUser | null> => {
    setLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      setIsAdmin(result.user.email === ADMIN_EMAIL);
      await updateUserProfileInFirestore(result.user); // Create/update profile on Google sign-in
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
      const updatedUser = { ...auth.currentUser } as FirebaseUser; // Create a new object to trigger re-renders
      setUser(updatedUser); // Update local user state
      await updateUserProfileInFirestore(updatedUser); // Sync with Firestore profile
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
