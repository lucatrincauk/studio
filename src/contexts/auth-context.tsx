
'use client';

import type { User as FirebaseUser, AuthError } from 'firebase/auth';
import type { UserProfile, EarnedBadge } from '@/lib/types';
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
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Compass } from 'lucide-react'; // For Welcome Badge toast

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

const updateUserProfileInFirestore = async (user: FirebaseUser, isNewUser: boolean = false) => {
  if (!user) return;
  const userProfileRef = doc(db, USER_PROFILES_COLLECTION, user.uid);
  
  let profileDataToSave: Partial<UserProfile> = {
    uid: user.uid, 
    email: user.email,
    photoURL: user.photoURL,
  };

  let awardWelcomeBadge = false;

  try {
    const profileSnap = await getDoc(userProfileRef);
    if (profileSnap.exists()) {
      const existingData = profileSnap.data() as UserProfile;
      profileDataToSave.name = user.displayName || existingData.name || user.email?.split('@')[0] || 'Utente Anonimo';
      profileDataToSave.bggUsername = existingData.bggUsername === "" ? null : (existingData.bggUsername || null);
      profileDataToSave.hasSubmittedReview = existingData.hasSubmittedReview ?? false;
      profileDataToSave.hasGivenFirstOne = existingData.hasGivenFirstOne ?? false;
      profileDataToSave.hasGivenFirstFive = existingData.hasGivenFirstFive ?? false;
      profileDataToSave.hasEarnedComprehensiveCritic = existingData.hasEarnedComprehensiveCritic ?? false;
      profileDataToSave.hasEarnedNightOwlReviewer = existingData.hasEarnedNightOwlReviewer ?? false;
      profileDataToSave.hasReceivedWelcomeBadge = existingData.hasReceivedWelcomeBadge ?? false;
      profileDataToSave.hasEarnedFavoriteFanaticBadge = existingData.hasEarnedFavoriteFanaticBadge ?? false;
      profileDataToSave.hasEarnedPlaylistProBadge = existingData.hasEarnedPlaylistProBadge ?? false;
    } else { 
      profileDataToSave.name = user.displayName || user.email?.split('@')[0] || 'Utente Anonimo';
      profileDataToSave.bggUsername = null; 
      profileDataToSave.hasSubmittedReview = false; 
      profileDataToSave.hasGivenFirstOne = false;
      profileDataToSave.hasGivenFirstFive = false;
      profileDataToSave.hasEarnedComprehensiveCritic = false;
      profileDataToSave.hasEarnedNightOwlReviewer = false;
      profileDataToSave.hasReceivedWelcomeBadge = false; // New users haven't received it yet
      profileDataToSave.hasEarnedFavoriteFanaticBadge = false;
      profileDataToSave.hasEarnedPlaylistProBadge = false;
      if (isNewUser) { // Only mark to award if it's truly a new user account creation/first Google sign-in
        awardWelcomeBadge = true;
      }
    }
    
    // Ensure boolean fields always have a default if somehow missed
    profileDataToSave.hasSubmittedReview = profileDataToSave.hasSubmittedReview ?? false;
    profileDataToSave.hasGivenFirstOne = profileDataToSave.hasGivenFirstOne ?? false;
    profileDataToSave.hasGivenFirstFive = profileDataToSave.hasGivenFirstFive ?? false;
    profileDataToSave.hasEarnedComprehensiveCritic = profileDataToSave.hasEarnedComprehensiveCritic ?? false;
    profileDataToSave.hasEarnedNightOwlReviewer = profileDataToSave.hasEarnedNightOwlReviewer ?? false;
    profileDataToSave.hasReceivedWelcomeBadge = profileDataToSave.hasReceivedWelcomeBadge ?? false;
    profileDataToSave.hasEarnedFavoriteFanaticBadge = profileDataToSave.hasEarnedFavoriteFanaticBadge ?? false;
    profileDataToSave.hasEarnedPlaylistProBadge = profileDataToSave.hasEarnedPlaylistProBadge ?? false;


    await setDoc(userProfileRef, profileDataToSave, { merge: true });

    if (awardWelcomeBadge && !profileDataToSave.hasReceivedWelcomeBadge) {
      const badgeRef = doc(userProfileRef, 'earned_badges', 'welcome_explorer');
      const badgeData: EarnedBadge = {
        badgeId: 'welcome_explorer',
        name: 'Esploratore di Punteggi',
        description: 'Benvenuto! Hai creato il tuo account e sei pronto a esplorare e valutare.',
        iconName: 'Compass',
        earnedAt: serverTimestamp(),
      };
      await setDoc(badgeRef, badgeData);
      await updateDoc(userProfileRef, { hasReceivedWelcomeBadge: true });
      toast({
        title: "Distintivo Guadagnato!",
        description: "Benvenuto! Hai ricevuto: Esploratore di Punteggi!",
        icon: <Compass className="h-5 w-5 text-green-500" />,
      });
    }

  } catch (firestoreError) {
    console.error("Error updating user profile in Firestore:", firestoreError);
    // Basic fallback assignment if everything else fails
    if (!profileDataToSave.name) {
       profileDataToSave.name = user.displayName || user.email?.split('@')[0] || 'Utente Anonimo';
    }
    if (typeof profileDataToSave.bggUsername === 'undefined') {
       profileDataToSave.bggUsername = null;
    }
    profileDataToSave.hasSubmittedReview = profileDataToSave.hasSubmittedReview ?? false;
    profileDataToSave.hasGivenFirstOne = profileDataToSave.hasGivenFirstOne ?? false;
    profileDataToSave.hasGivenFirstFive = profileDataToSave.hasGivenFirstFive ?? false;
    profileDataToSave.hasEarnedComprehensiveCritic = profileDataToSave.hasEarnedComprehensiveCritic ?? false;
    profileDataToSave.hasEarnedNightOwlReviewer = profileDataToSave.hasEarnedNightOwlReviewer ?? false;
    profileDataToSave.hasReceivedWelcomeBadge = profileDataToSave.hasReceivedWelcomeBadge ?? false;
    profileDataToSave.hasEarnedFavoriteFanaticBadge = profileDataToSave.hasEarnedFavoriteFanaticBadge ?? false;
    profileDataToSave.hasEarnedPlaylistProBadge = profileDataToSave.hasEarnedPlaylistProBadge ?? false;
    try {
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
        // Check if profile exists; if not, it's effectively a "first time setup" for this session
        const profileRef = doc(db, USER_PROFILES_COLLECTION, firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        await updateUserProfileInFirestore(firebaseUser, !profileSnap.exists()); 
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
        await updateUserProfileInFirestore(auth.currentUser, true); // True for isNewUser
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
      if (userCredential.user) {
        const profileRef = doc(db, USER_PROFILES_COLLECTION, userCredential.user.uid);
        const profileSnap = await getDoc(profileRef);
        await updateUserProfileInFirestore(userCredential.user, !profileSnap.exists()); 
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
      if (result.user) {
        const profileRef = doc(db, USER_PROFILES_COLLECTION, result.user.uid);
        const profileSnap = await getDoc(profileRef);
        await updateUserProfileInFirestore(result.user, !profileSnap.exists()); 
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
    const firestoreUpdatePayload: Partial<UserProfile> = {}; 
    let authProfileUpdated = false;

    if (typeof updates.displayName === 'string' && updates.displayName !== auth.currentUser.displayName) {
      try {
        await firebaseUpdateProfile(auth.currentUser, { displayName: updates.displayName });
        authProfileUpdated = true;
        firestoreUpdatePayload.name = updates.displayName;
      } catch (e) {
        const updateError = e as AuthError;
        setError(updateError);
        toast({ title: "Errore Aggiornamento Nome Visualizzato", description: updateError.message, variant: "destructive" });
        return false;
      }
    } else if (updates.displayName) { 
        firestoreUpdatePayload.name = updates.displayName;
    } else if (auth.currentUser.displayName) { 
        firestoreUpdatePayload.name = auth.currentUser.displayName;
    }


    if (typeof updates.bggUsername !== 'undefined') {
      firestoreUpdatePayload.bggUsername = updates.bggUsername === "" ? null : updates.bggUsername;
    }
    
    try {
      const userProfileRef = doc(db, USER_PROFILES_COLLECTION, auth.currentUser.uid);
      const profileSnap = await getDoc(userProfileRef);
      let finalPayload = { ...firestoreUpdatePayload };

      if (profileSnap.exists()) {
        const existingData = profileSnap.data() as UserProfile;
        // Preserve existing badge flags not part of this specific update
        finalPayload.hasSubmittedReview = existingData.hasSubmittedReview ?? false;
        finalPayload.hasGivenFirstOne = existingData.hasGivenFirstOne ?? false;
        finalPayload.hasGivenFirstFive = existingData.hasGivenFirstFive ?? false;
        finalPayload.hasEarnedComprehensiveCritic = existingData.hasEarnedComprehensiveCritic ?? false;
        finalPayload.hasEarnedNightOwlReviewer = existingData.hasEarnedNightOwlReviewer ?? false;
        finalPayload.hasReceivedWelcomeBadge = existingData.hasReceivedWelcomeBadge ?? false;
        finalPayload.hasEarnedFavoriteFanaticBadge = existingData.hasEarnedFavoriteFanaticBadge ?? false;
        finalPayload.hasEarnedPlaylistProBadge = existingData.hasEarnedPlaylistProBadge ?? false;
      } else { 
        // Set defaults if profile somehow didn't exist (shouldn't happen if signup/login creates it)
        finalPayload.hasSubmittedReview = finalPayload.hasSubmittedReview ?? false;
        finalPayload.hasGivenFirstOne = finalPayload.hasGivenFirstOne ?? false;
        finalPayload.hasGivenFirstFive = finalPayload.hasGivenFirstFive ?? false;
        finalPayload.hasEarnedComprehensiveCritic = finalPayload.hasEarnedComprehensiveCritic ?? false;
        finalPayload.hasEarnedNightOwlReviewer = finalPayload.hasEarnedNightOwlReviewer ?? false;
        finalPayload.hasReceivedWelcomeBadge = finalPayload.hasReceivedWelcomeBadge ?? false;
        finalPayload.hasEarnedFavoriteFanaticBadge = finalPayload.hasEarnedFavoriteFanaticBadge ?? false;
        finalPayload.hasEarnedPlaylistProBadge = finalPayload.hasEarnedPlaylistProBadge ?? false;
      }
      
      await setDoc(userProfileRef, finalPayload, { merge: true });
      
      if (authProfileUpdated && auth.currentUser) {
         await auth.currentUser.reload(); 
         const reloadedUser = auth.currentUser; 
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
