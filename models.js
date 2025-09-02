import { Schema, model } from "mongoose";

const chatSchema = new Schema(
  {
    content: String,
    sender: String,
    userId: String,
  },
  { timestamps: true }
);

const fileSchema = new Schema(
  {
    name: String,
    size: Number,
    type: String,
    userId:String
  },
  {
    timestamps: true,
  }
);

export const ChatModel = model("Chat", chatSchema);
export const FileModel = model("File", fileSchema);
