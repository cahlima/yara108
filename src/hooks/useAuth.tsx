import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  isApproved: boolean | null;
  isAdmin: boolean | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isApproved: null,
    isAdmin: null,
    loading: true,
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setState(prev => ({
        ...prev,
        session,
        user: session?.user ?? null,
      }));

      if (session?.user) {
        setTimeout(() => {
          checkUserStatus(session.user.id);
        }, 0);
      } else {
        setState(prev => ({
          ...prev,
          isApproved: null,
          isAdmin: null,
          loading: false,
        }));
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(prev => ({
        ...prev,
        session,
        user: session?.user ?? null,
      }));

      if (session?.user) {
        checkUserStatus(session.user.id);
      } else {
        setState(prev => ({ ...prev, loading: false }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserStatus = async (userId: string) => {
    try {
      // Check approval status
      const { data: profile } = await supabase
        .from("profiles")
        .select("approved")
        .eq("id", userId)
        .maybeSingle();

      // Check admin role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const isAdmin = roles?.some(r => r.role === "admin") ?? false;

      setState(prev => ({
        ...prev,
        isApproved: profile?.approved ?? false,
        isAdmin,
        loading: false,
      }));
    } catch (error) {
      console.error("Error checking user status:", error);
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
