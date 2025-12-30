import {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode,
} from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[Auth] Hook montado, configurando listener...');
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('[Auth] onAuthStateChanged acionado. Usuário:', currentUser ? currentUser.uid : 'null');
      setUser(currentUser);
      
      if (currentUser) {
        try {
          console.log('[Auth] Verificando status de admin...');
          const adminRef = doc(db, 'admins', currentUser.uid);
          const adminSnap = await getDoc(adminRef);
          const isAdminUser = adminSnap.exists();
          setIsAdmin(isAdminUser);
          console.log('[Auth] Status de admin verificado:', isAdminUser);
        } catch (error) {
          console.error('[Auth] Erro ao verificar status de admin:', error);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
        console.log('[Auth] Usuário nulo, isAdmin definido como false.');
      }
      
      console.log('[Auth] Definindo loading como false.');
      setLoading(false);
    });

    return () => {
      console.log('[Auth] Hook desmontado, limpando listener.');
      unsubscribe();
    };
  }, []);

  console.log('[Auth] Renderizando Provider com estado:', { loading, user: user?.uid, isAdmin });

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
