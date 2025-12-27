import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// Defina o e-mail do Super Admin
const SUPER_ADMIN_EMAIL = "caciabad@gmail.com";

interface AuthState {
  user: User | null;
  isApproved: boolean;
  isAdmin: boolean;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isApproved: false,
    isAdmin: false,
    loading: true,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Verifique se o usuário é o Super Admin
        if (user.email === SUPER_ADMIN_EMAIL) {
          setState({
            user,
            isApproved: true,
            isAdmin: true,
            loading: false,
          });
        } else {
          // Para todos os outros usuários, verifique o status no banco de dados
          setState(prevState => ({ ...prevState, user, loading: true }));
          await checkUserStatus(user.uid);
        }
      } else {
        // Nenhum usuário está logado
        setState({
          user: null,
          isApproved: false,
          isAdmin: false,
          loading: false,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const checkUserStatus = async (userId: string) => {
    try {
      // Status padrão
      let isApproved = false;
      let isAdmin = false;

      // Verifique o status de aprovação na coleção 'profiles'
      const profileDocRef = doc(db, "profiles", userId);
      const profileDocSnap = await getDoc(profileDocRef);

      if (profileDocSnap.exists()) {
        isApproved = profileDocSnap.data().approved ?? false;
      }

      // Verifique a função de admin na coleção 'user_roles'
      const rolesQuery = query(
        collection(db, "user_roles"),
        where("user_id", "==", userId)
      );
      const rolesSnapshot = await getDocs(rolesQuery);
      
      if (!rolesSnapshot.empty) {
        isAdmin = rolesSnapshot.docs.some(doc => doc.data().role === "admin");
      }

      setState(prev => ({
        ...prev,
        isApproved,
        isAdmin,
        loading: false,
      }));

    } catch (error) {
      console.error("Erro ao verificar o status do usuário:", error);
      setState(prev => ({
        ...prev,
        isApproved: false,
        isAdmin: false,
        loading: false,
      }));
    }
  };

  return state;
}
