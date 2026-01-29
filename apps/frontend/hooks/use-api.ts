import axios from "axios";

export default function useApi() {
  const baseURL = process.env.NEXT_PUBLIC_API_URL;

  const apiRequest = axios.create({
    baseURL,
    withCredentials: true,
  });

  return apiRequest;
}
