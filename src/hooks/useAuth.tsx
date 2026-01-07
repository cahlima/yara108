
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '@/lib/firebase';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore'; // Using onSnapshot for real-time updates

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isApproved: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isApproved, setIsApproved] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    // Effect to subscribe to auth state changes from Firebase
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            // Initial loading state until user status is fully checked
            setLoading(true);
        });
        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    // Effect to check user claims and Firestore document
    useEffect(() => {
        // We need a variable to hold the snapshot unsubscribe function
        let unsubscribeSnapshot: () => void = () => {};

        if (user) {
            // Immediately check for admin claims. Force refresh to get latest claims.
            user.getIdTokenResult(true).then((idTokenResult) => {
                const userIsAdmin = idTokenResult.claims.admin === true;
                setIsAdmin(userIsAdmin);

                if (userIsAdmin) {
                    // An admin is always approved. No need for Firestore listeners.
                    setIsApproved(true);
                    setLoading(false);
                } else {
                    // For non-admins, listen to their user document in Firestore for real-time approval changes.
                    const userDocRef = doc(db, 'users', user.uid);
                    unsubscribeSnapshot = onSnapshot(userDocRef, (docSnap) => {
                        if (docSnap.exists() && docSnap.data().approved === true) {
                            setIsApproved(true);
                        } else {
                            setIsApproved(false);
                        }
                        setLoading(false);
                    }, (error) => {
                        console.error("Error listening to user document:", error);
                        setIsApproved(false);
                        setLoading(false);
                    });
                }
            }).catch((error) => {
                console.error("Error getting user token:", error);
                // On error, default to non-privileged state
                setIsAdmin(false);
                setIsApproved(false);
                setLoading(false);
            });
        } else {
            // If there's no user, reset all states
            setIsAdmin(false);
            setIsApproved(false);
            setLoading(false);
        }

        // Cleanup the snapshot listener when the user changes or component unmounts
        return () => {
            unsubscribeSnapshot();
        };
    }, [user]); // This effect runs whenever the user object changes

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
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
