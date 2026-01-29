"use client";

import { Loader2Icon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useEffect, useState } from "react";
import { useGetProfile } from "@/hooks/api/auth";

interface AuthContextType {
  user: any | null;
  setUser: React.Dispatch<React.SetStateAction<any | null>>;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {},
  isFetching: true,
  refetch: async () => {},
});

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any | null>(null);
  const [isFetching, setFetching] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { refetch: getProfile } = useGetProfile();

  useEffect(() => {
    if (!user)
      getProfile()
        .then(({ data }) => {
          setUser(data.data?.user ?? null);
        })
        .finally(() => setFetching(false));
  }, [user, pathname]);

  useEffect(() => {
    if (isFetching) return;

    if (pathname.includes("/auth") && user) router.push("/");
    if (pathname.includes("/dashboard") && !user) router.push("/auth/login");
  }, [isFetching, user, pathname]);

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        isFetching,
        refetch: getProfile,
      }}
    >
      {isFetching ? (
        <div className="flex h-screen w-full items-center justify-center">
          <div className="flex items-center justify-center gap-2">
            <Loader2Icon className="size-12 animate-spin" />
            <div>
              <h3 className="text-2xl font-medium">Authentication</h3>
              <p className="text-sm text-gray-500">
                Please wait while we authenticate your account
              </p>
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
