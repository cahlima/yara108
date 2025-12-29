import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";

import { app, db } from "@/lib/firebase";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  confirmPasswordReset,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const authSchema = z.object({
  email: z.string().email("Email inválido").min(1, "Email é obrigatório"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

const emailSchema = z.object({
  email: z.string().email("Email inválido").min(1, "Email é obrigatório"),
});

const passwordSchema = z.object({
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

type AuthMode = "login" | "signup" | "forgot" | "reset";

export default function Auth() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oobCode, setOobCode] = useState<string | null>(null);
  const navigate = useNavigate();
  const auth = getAuth(app);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramMode = params.get('mode');
    const paramOobCode = params.get('oobCode');

    if (paramMode === 'resetPassword' && paramOobCode) {
      setMode("reset");
      setOobCode(paramOobCode);
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const adminDocRef = doc(db, "admins", user.uid);
        const adminDoc = await getDoc(adminDocRef);
        
        // Check for customer approval (if they aren't an admin)
        if (adminDoc.exists()) {
            navigate("/");
        } else {
            const userDocRef = doc(db, "customers", user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists() && userDoc.data().approved) {
              navigate("/");
            } else {
              navigate("/pending-approval");
            }
        }
      }
    });

    return () => unsubscribe();
  }, [auth, navigate]);

  const handleAuthError = (error: any) => {
    if (error.code === 'auth/invalid-email') {
        toast.error("Formato de email inválido.");
    } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        toast.error("Email ou senha incorretos.");
    } else if (error.code === 'auth/email-already-in-use') {
        toast.error("Este email já está cadastrado.");
    } else {
        toast.error(error.message || "Ocorreu um erro.");
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "forgot") {
        const validatedData = emailSchema.parse({ email });
        await sendPasswordResetEmail(auth, validatedData.email);
        toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
        setMode("login");

      } else if (mode === "reset") {
        if (!oobCode) {
            toast.error("Link de redefinição inválido ou expirado.");
            return;
        }
        const validatedData = passwordSchema.parse({ password: newPassword });
        await confirmPasswordReset(auth, oobCode, validatedData.password);
        toast.success("Senha atualizada com sucesso!");
        navigate("/auth");

      } else if (mode === "login") {
        const validatedData = authSchema.parse({ email, password });
        await signInWithEmailAndPassword(auth, validatedData.email, validatedData.password);
        // onAuthStateChanged will handle navigation

      } else { // signup
        const validatedData = authSchema.parse({ email, password });
        const userCredential = await createUserWithEmailAndPassword(auth, validatedData.email, validatedData.password);
        const user = userCredential.user;
        const isAdminEmail = user.email === "caciabad@gmail.com";

        // Create user profile in Firestore
        await setDoc(doc(db, "customers", user.uid), {
            id: user.uid,
            email: user.email,
            name: user.email.split('@')[0],
            approved: isAdminEmail, // Auto-approve admin
            created_at: new Date().toISOString(),
        });

        if (isAdminEmail) {
            await setDoc(doc(db, "admins", user.uid), {
                role: "admin",
                created_at: new Date().toISOString(),
            });
            toast.success("Conta de administrador criada com sucesso! Você será redirecionado.");
        } else {
            toast.success("Cadastro realizado! Aguarde a aprovação do administrador.");
        }
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        handleAuthError(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case "login": return "Login";
      case "signup": return "Cadastro";
      case "forgot": return "Recuperar Senha";
      case "reset": return "Nova Senha";
    }
  };

  const getDescription = () => {
    switch (mode) {
      case "login": return "Entre com suas credenciais para acessar o sistema";
      case "signup": return "Crie uma conta para começar a usar o sistema";
      case "forgot": return "Digite seu email para receber o link de recuperação";
      case "reset": return "Digite sua nova senha";
    }
  };

  const getButtonText = () => {
    if (loading) return "Processando...";
    switch (mode) {
      case "login": return "Entrar";
      case "signup": return "Cadastrar";
      case "forgot": return "Enviar Email";
      case "reset": return "Atualizar Senha";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{getTitle()}</CardTitle>
          <CardDescription>{getDescription()}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode !== "reset" && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            )}
            {(mode === "login" || mode === "signup") && (
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}
            {mode === "reset" && (
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {getButtonText()}
            </Button>
          </form>
          
          {mode === "login" && (
            <div className="mt-4 space-y-2 text-center">
              <button
                onClick={() => setMode("forgot")}
                className="text-sm text-muted-foreground hover:text-foreground block w-full"
              >
                Esqueceu sua senha?
              </button>
              <button
                onClick={() => setMode("signup")}
                className="text-sm text-muted-foreground hover:text-foreground block w-full"
              >
                Não tem uma conta? Cadastre-se
              </button>
            </div>
          )}
          
          {mode === "signup" && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setMode("login")}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Já tem uma conta? Faça login
              </button>
            </div>
          )}
          
          {mode === "forgot" && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setMode("login")}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Voltar ao login
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
