
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { auth, db } from '@/lib/firebase';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const defaultAuthContext: AuthContextType = {
    user: null,
    loading: true,
    isApproved: false,
    isAdmin: false,
    signOut: async () => { await firebaseSignOut(auth); },
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isApproved, setIsApproved] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        if (currentUser) {
            let firestoreUnsubscribe = () => {};

            const processUser = async () => {
                try {
                    const idTokenResult = await currentUser.getIdTokenResult(true); // Force refresh
                    const userIsAdmin = idTokenResult.claims.admin === true;

                    if (userIsAdmin) {
                        setUser(currentUser);
                        setIsAdmin(true);
                        setIsApproved(true);
                        setLoading(false);
                    } else {
                        const userDocRef = doc(db, 'users', currentUser.uid);
                        firestoreUnsubscribe = onSnapshot(userDocRef, (userDoc) => {
                            const userIsApproved = userDoc.exists() && userDoc.data()?.status === 'APPROVED';
                            setUser(currentUser);
                            setIsAdmin(false);
                            setIsApproved(userIsApproved);
                            setLoading(false);
                        }, (error) => {
                            console.error("Error with Firestore snapshot listener:", error);
                            setUser(null);
                            setIsAdmin(false);
                            setIsApproved(false);
                            setLoading(false);
                        });
                    }
                } catch (error) {
                    console.error("Error fetching user data or claims:", error);
                    setUser(null);
                    setIsAdmin(false);
                    setIsApproved(false);
                    setLoading(false);
                }
            };

            processUser();

            // Cleanup function for snapshot listener
            return () => {
                firestoreUnsubscribe();
            };
        } else {
            // No user, clear all state
            setUser(null);
            setIsAdmin(false);
            setIsApproved(false);
            setLoading(false);
        }
    });

    return () => unsubscribe();
}, []);

    const signOut = useCallback(async () => {
        try {
            await firebaseSignOut(auth);
            // State clearing is handled by the onAuthStateChanged listener's else block.
        } catch (error) {
            console.error("Error signing out:", error);
        }
    }, []);

    const value = { user, loading, isApproved, isAdmin, signOut };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
