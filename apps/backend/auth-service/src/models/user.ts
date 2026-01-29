import { Schema, model, InferSchemaType, Types } from "mongoose";
import { Role } from "@/enums/role";

const schema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    hashedPassword: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: Role,
      default: Role.USER,
    },
  },
  { timestamps: true },
);

export const User = model("User", schema);
export type UserType = InferSchemaType<typeof schema> & {
  _id: Types.ObjectId;
};
