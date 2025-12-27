import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  confirmPasswordReset,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { z } from "zod";

const authSchema = z.object({
  email: z.string().email("Email inválido").min(1, "Email é obrigatório"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

const emailSchema = z.object({
  email: z.string().email("Email inválido").min(1, "Email é obrigatório"),
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

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const modeParam = searchParams.get('mode');
    const code = searchParams.get('oobCode');

    if (modeParam === 'resetPassword' && code) {
      setMode("reset");
      setOobCode(code);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && mode !== "reset") {
        navigate("/");
      }
    });

    return () => unsubscribe();
  }, [navigate, mode]);

  const handleAuthError = (error: any) => {
    if (error instanceof z.ZodError) {
      toast.error(error.errors[0].message);
      return;
    }
    
    let message = "Ocorreu um erro. Tente novamente.";
    if (error.code) {
      switch (error.code) {
        case "auth/invalid-email":
          message = "Email inválido.";
          break;
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
          message = "Email ou senha incorretos.";
          break;
        case "auth/email-already-in-use":
          message = "Este email já está cadastrado.";
          break;
        case "auth/weak-password":
          message = "A senha deve ter no mínimo 6 caracteres.";
          break;
        case "auth/expired-action-code":
          message = "O link de recuperação expirou. Tente novamente.";
          setMode("login");
          break;
        case "auth/invalid-action-code":
           message = "O link de recuperação é inválido. Tente novamente.";
           setMode("login");
           break;
        default:
          message = "Erro ao processar requisição";
      }
    }
    toast.error(message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "forgot") {
        const validatedData = emailSchema.parse({ email });
        await sendPasswordResetEmail(auth, validatedData.email, {
          url: `${window.location.origin}/auth`,
        });
        toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
        setMode("login");
      } else if (mode === "reset") {
        if (!oobCode) {
          toast.error("Código de recuperação inválido ou expirado.");
          setMode("login");
          return;
        }
        // Zod schema expects an email, but we don't need one here.
        const validatedData = authSchema.parse({ email: "placeholder@email.com", password: newPassword });
        await confirmPasswordReset(auth, oobCode, validatedData.password);
        toast.success("Senha atualizada com sucesso!");
        navigate("/");
      } else if (mode === "login") {
        const validatedData = authSchema.parse({ email, password });
        await signInWithEmailAndPassword(auth, validatedData.email, validatedData.password);
        toast.success("Login realizado com sucesso!");
        // onAuthStateChanged will handle navigation
      } else { // signup
        const validatedData = authSchema.parse({ email, password });
        await createUserWithEmailAndPassword(auth, validatedData.email, validatedData.password);
        toast.success("Cadastro realizado! Aguarde a aprovação do administrador para acessar o sistema.");
        setMode("login");
      }
    } catch (error) {
      handleAuthError(error);
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
