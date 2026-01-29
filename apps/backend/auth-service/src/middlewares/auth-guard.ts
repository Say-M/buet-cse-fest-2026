import { Role } from "@/enums/role";
import { AppBindings } from "@/app";
import { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { generateToken, verifyToken } from "@repo/common/utils/token";
import { User, UserType } from "@/models/user";
import { ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_MAX_AGE } from "@/constants";

export const roleGuard = ({ allowedRoles }: { allowedRoles: Role[] | -1 }) => {
  return async (c: Context<AppBindings>, next: Next) => {
    let accessToken =
      getCookie(c, "accessToken") || c.req.header("x-access-token");
    let user: UserType | null = null;
    if (accessToken) {
      const decoded = await verifyToken(accessToken, "EdDSA");

      if (!decoded)
        return c.json(
          {
            message: "Unauthorized",
            status: 401,
            timestamp: new Date().toISOString(),
          },
          401,
        );

      user = await User.findById(decoded.userId).select("-hashedPassword");

      if (!user)
        return c.json(
          {
            message: "Forbidden",
            status: 403,
            timestamp: new Date().toISOString(),
          },
          403,
        );

      if (allowedRoles === -1) {
        c.set("user", user);
        return await next();
      }

      if (allowedRoles && !allowedRoles.includes(user.role))
        return c.json(
          {
            message: "Forbidden",
            status: 403,
            timestamp: new Date().toISOString(),
          },
          403,
        );
    } else {
      const refreshToken =
        getCookie(c, "refreshToken") || c.req.header("x-refresh-token");

      if (!refreshToken)
        return c.json(
          {
            message: "Unauthorized",
            status: 401,
            timestamp: new Date().toISOString(),
          },
          401,
        );

      const decodedRefresh = await verifyToken(refreshToken, "EdDSA");

      if (!decodedRefresh)
        return c.json(
          {
            message: "Unauthorized",
            status: 401,
            timestamp: new Date().toISOString(),
          },
          401,
        );

      user = await User.findById(decodedRefresh.userId).select(
        "-hashedPassword",
      );

      if (!user)
        return c.json(
          {
            message: "Unauthorized",
            status: 401,
            timestamp: new Date().toISOString(),
          },
          401,
        );

      accessToken = await generateToken({
        payload: {
          userId: user._id,
        },
        algorithm: "EdDSA",
        expiresIn: ACCESS_TOKEN_MAX_AGE,
      });

      setCookie(c, "accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: ACCESS_TOKEN_MAX_AGE,
        sameSite: "strict",
        path: "/",
      });

      const newRefreshToken = await generateToken({
        payload: {
          userId: user._id,
        },
        algorithm: "EdDSA",
        expiresIn: REFRESH_TOKEN_MAX_AGE,
      });

      setCookie(c, "refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: REFRESH_TOKEN_MAX_AGE,
        sameSite: "strict",
        path: "/",
      });
    }
    if (user) c.set("user", user);
    return await next();
  };
};
