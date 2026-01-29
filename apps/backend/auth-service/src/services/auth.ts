import { User } from "@/models/user";
import { LoginSchemaType, RegisterSchemaType } from "@/schemas/auth";
import { generateToken } from "@repo/common/utils/token";
import { HTTPException } from "hono/http-exception";
import { ResponseType } from "@repo/common/schemas/response";
import { deleteCookie, setCookie } from "hono/cookie";
import { Context } from "hono";
import { AppBindings } from "@/app";
import { ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_MAX_AGE } from "@/constants";

export const registerService = async (
  c: Context<AppBindings>,
  json: RegisterSchemaType,
): Promise<ResponseType> => {
  const { email, password, name } = json;

  const isUserExists = await User.exists({ email });

  if (isUserExists) {
    throw new HTTPException(400, { message: "User already exists" });
  }

  const hashedPassword = await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
  const user = await User.create({ email, name, hashedPassword });

  const accessToken = await generateToken({
    payload: {
      userId: user._id,
    },
    algorithm: "EdDSA",
    expiresIn: ACCESS_TOKEN_MAX_AGE,
  });
  const refreshToken = await generateToken({
    payload: {
      userId: user._id,
    },
    algorithm: "EdDSA",
    expiresIn: REFRESH_TOKEN_MAX_AGE,
  });

  setCookie(c, "accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: ACCESS_TOKEN_MAX_AGE,
    sameSite: "strict",
    path: "/",
  });
  setCookie(c, "refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: REFRESH_TOKEN_MAX_AGE,
    sameSite: "strict",
    path: "/",
  });
  const { hashedPassword: _hashedPassword, ...userData } = user.toObject();
  return {
    status: 201,
    message: "User registered successfully",
    timestamp: new Date().toISOString(),
    data: {
      accessToken,
      refreshToken,
      user: userData,
    },
  };
};

export const loginService = async (
  c: Context<AppBindings>,
  json: LoginSchemaType,
): Promise<ResponseType> => {
  const { email, password } = json;
  const user = await User.findOne({ email });

  if (!user) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  const isPasswordValid = await Bun.password.verify(
    password,
    user.hashedPassword,
    "bcrypt",
  );

  if (!isPasswordValid) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  const accessToken = await generateToken({
    payload: {
      userId: user._id,
    },
    algorithm: "EdDSA",
    expiresIn: ACCESS_TOKEN_MAX_AGE,
  });
  const refreshToken = await generateToken({
    payload: {
      userId: user._id,
    },
    algorithm: "EdDSA",
    expiresIn: REFRESH_TOKEN_MAX_AGE,
  });

  setCookie(c, "accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: ACCESS_TOKEN_MAX_AGE,
    sameSite: "strict",
    path: "/",
  });
  setCookie(c, "refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: REFRESH_TOKEN_MAX_AGE,
    sameSite: "strict",
    path: "/",
  });

  const { hashedPassword, ...userData } = user.toObject();
  return {
    status: 200,
    message: "Login successful",
    timestamp: new Date().toISOString(),
    data: {
      accessToken,
      refreshToken,
      user: userData,
    },
  };
};

export const userProfileService = async (
  c: Context<AppBindings>,
): Promise<ResponseType> => {
  const user = c.var.user;

  return {
    status: 200,
    message: "User profile fetched successfully",
    timestamp: new Date().toISOString(),
    data: { user },
  };
};

export const refreshTokenService = async (
  c: Context<AppBindings>,
): Promise<ResponseType> => {
  const user = c.var.user!;

  const accessToken = await generateToken({
    payload: {
      userId: user._id,
    },
    algorithm: "EdDSA",
    expiresIn: ACCESS_TOKEN_MAX_AGE,
  });
  const refreshToken = await generateToken({
    payload: {
      userId: user._id,
    },
    algorithm: "EdDSA",
    expiresIn: REFRESH_TOKEN_MAX_AGE,
  });

  setCookie(c, "accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: ACCESS_TOKEN_MAX_AGE,
    sameSite: "strict",
    path: "/",
  });
  setCookie(c, "refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: REFRESH_TOKEN_MAX_AGE,
    sameSite: "strict",
    path: "/",
  });
  return {
    status: 200,
    message: "Token refreshed successfully",
    timestamp: new Date().toISOString(),
    data: { accessToken, refreshToken },
  };
};

export const logoutService = async (
  c: Context<AppBindings>,
): Promise<ResponseType> => {
  deleteCookie(c, "accessToken");
  deleteCookie(c, "refreshToken");
  return {
    status: 200,
    message: "Logout successful",
    timestamp: new Date().toISOString(),
  };
};

export const heavyOperationService = async (
  c: Context<AppBindings>,
): Promise<ResponseType> => {
  for (let i = 0; i < 1e10; i++) {}
  return {
    status: 200,
    message: "Heavy operation completed",
    timestamp: new Date().toISOString(),
  };
};

export const publicService = async (
  c: Context<AppBindings>,
): Promise<ResponseType> => {
  return {
    status: 200,
    message: "Public service",
    timestamp: new Date().toISOString(),
  };
};
