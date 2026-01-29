import { useContext } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import useApi from "../use-api";
import { LoginSchemaType, RegisterSchemaType } from "@/schemas/auth";
import { toast } from "sonner";
import { AxiosError } from "axios";
import { AuthContext } from "@/contexts/auth.context";
import { useRouter } from "next/navigation";

export const useLogin = () => {
  const api = useApi();
  const { setUser } = useContext(AuthContext);
  const router = useRouter();
  return useMutation({
    mutationFn: async (payload: LoginSchemaType) => {
      const { data } = await api.post("/auth/login", payload);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message);
      setUser(data.data.user);
      router.push("/");
    },
    onError: (error: AxiosError) => {
      toast.error((error.response?.data as { message: string }).message);
    },
  });
};

export const useRegister = () => {
  const api = useApi();
  const { setUser } = useContext(AuthContext);
  const router = useRouter();
  return useMutation({
    mutationFn: async (payload: RegisterSchemaType) => {
      const { data } = await api.post("/auth/register", payload);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message);
      setUser(data.data.user);
      router.push("/");
    },
    onError: (error: AxiosError) => {
      toast.error((error.response?.data as { message: string }).message);
    },
  });
};

export const useLogout = () => {
  const api = useApi();
  const { setUser } = useContext(AuthContext);
  const router = useRouter();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/auth/logout");
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message);
      setUser(null);
      router.push("/auth/login");
    },
    onError: (error: AxiosError) => {
      toast.error((error.response?.data as { message: string }).message);
    },
  });
};

export const useGetProfile = () => {
  const api = useApi();
  return useQuery({
    queryKey: ["profile"],
    retry: 1,
    queryFn: async () => {
      const { data } = await api.get("/auth/profile");
      return data;
    },
  });
};
