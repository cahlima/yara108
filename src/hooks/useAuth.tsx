import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { app, db } from "@/lib/firebase";

interface AuthState {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAdmin: false,
    loading: true,
  });

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const adminDocRef = doc(db, "admins", user.uid);
        try {
          const adminDoc = await getDoc(adminDocRef);
          const isAdmin = adminDoc.exists();

          setState({
            user,
            isAdmin,
            loading: false,
          });
        } catch (error) {
          console.error("Error checking admin status:", error);
          setState({
            user,
            isAdmin: false, // Assume not admin on error
            loading: false,
          });
        }
      } else {
        setState({
          user: null,
          isAdmin: false,
          loading: false,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return state;
}
