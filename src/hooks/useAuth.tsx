
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { auth, db } from '@/lib/firebase';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isApproved: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true); // Renamed for clarity: auth state loading
    const [isApproved, setIsApproved] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    const checkUserStatus = useCallback(async (user: User | null) => {
        if (user) {
            // 1. Check for custom admin claims first
            const token = await user.getIdTokenResult();
            const userIsAdmin = token.claims.admin === true;
            setIsAdmin(userIsAdmin);

            // An admin is always considered approved.
            if (userIsAdmin) {
                setIsApproved(true);
            } else {
                // For non-admins, check their profile in the 'users' collection.
                const userDocRef = doc(db, 'users', user.uid);
                try {
                    const userDoc = await getDoc(userDocRef);
                    // User is approved only if the document exists and 'approved' field is true.
                    if (userDoc.exists() && userDoc.data().approved === true) {
                        setIsApproved(true);
                    } else {
                        setIsApproved(false);
                    }
                } catch (err) {
                    console.error("Erro ao buscar perfil do usuário:", { code: (err as any).code, message: (err as any).message });
                    setIsApproved(false);
                }
            }
        } else {
            // Reset states on logout
            setIsAdmin(false);
            setIsApproved(false);
        }
        // This loading state now represents the completion of auth AND profile checks
        setLoading(false);
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setUser(user);
            await checkUserStatus(user);
        });

        return () => unsubscribe();
    }, [checkUserStatus]);

    const value = { user, loading, isApproved, isAdmin };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
