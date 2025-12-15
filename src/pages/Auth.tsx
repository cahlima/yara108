import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  const navigate = useNavigate();

  useEffect(() => {
    // Check URL hash for recovery token
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get("type");
    const accessToken = hashParams.get("access_token");
    
    if (type === "recovery" && accessToken) {
      setMode("reset");
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset");
      } else if (session && mode !== "reset") {
        navigate("/");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && mode !== "reset") {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "forgot") {
        const validatedData = emailSchema.parse({ email });
        const redirectUrl = window.location.origin + '/auth';
        const { error } = await supabase.auth.resetPasswordForEmail(validatedData.email, {
          redirectTo: redirectUrl,
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
        setMode("login");
      } else if (mode === "reset") {
        const validatedData = authSchema.parse({ email: "placeholder@email.com", password: newPassword });
        const { error } = await supabase.auth.updateUser({
          password: validatedData.password,
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        toast.success("Senha atualizada com sucesso!");
        navigate("/");
      } else if (mode === "login") {
        const validatedData = authSchema.parse({ email, password });
        const { error } = await supabase.auth.signInWithPassword({
          email: validatedData.email,
          password: validatedData.password,
        });

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast.error("Email ou senha incorretos");
          } else {
            toast.error(error.message);
          }
          return;
        }

        toast.success("Login realizado com sucesso!");
      } else {
        const validatedData = authSchema.parse({ email, password });
        const { error } = await supabase.auth.signUp({
          email: validatedData.email,
          password: validatedData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (error) {
          if (error.message.includes("User already registered")) {
            toast.error("Este email já está cadastrado");
          } else {
            toast.error(error.message);
          }
          return;
        }

        toast.success("Cadastro realizado! Você já pode fazer login.");
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error("Erro ao processar requisição");
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
