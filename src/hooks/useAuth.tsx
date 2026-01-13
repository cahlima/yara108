
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { auth, db } from '@/lib/firebase';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

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
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                try {
                    const idTokenResult = await currentUser.getIdTokenResult(true); // Force refresh
                    const userIsAdmin = idTokenResult.claims.admin === true;
                    setIsAdmin(userIsAdmin);

                    if (userIsAdmin) {
                        // If the user is an admin, they are automatically approved.
                        setIsApproved(true);
                    } else {
                        // For non-admin users, check the 'status' field in Firestore.
                        const userDocRef = doc(db, 'users', currentUser.uid);
                        const userDoc = await getDoc(userDocRef);
                        const userIsApproved = userDoc.exists() && userDoc.data().status === 'APPROVED';
                        setIsApproved(userIsApproved);
                    }
                } catch (error) {
                    console.error("Error fetching user data or claims:", error);
                    setIsAdmin(false);
                    setIsApproved(false);
                }
            } else {
                // No user is logged in.
                setUser(null);
                setIsAdmin(false);
                setIsApproved(false);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const signOut = useCallback(async () => {
        try {
            await firebaseSignOut(auth);
            // State clearing is handled by the onAuthStateChanged listener.
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
