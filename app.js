import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import "dotenv/config";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { MistralAIEmbeddings, ChatMistralAI } from "@langchain/mistralai";
import dbConnect from "./db.js";
import { ChatModel, FileModel } from "./models.js";
import { returnError, returnSuccess } from "./utils.js";

const app = express();
const PORT = process.env.PORT || 5050;
dbConnect();
app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./assets");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    cb(null, `${baseName}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage: storage });

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pinecone.index(process.env.PINECONE_INDEX);

const embeddings = new MistralAIEmbeddings({
  model: "mistral-embed",
  apiKey: process.env.MISTRAL_API_KEY,
});

app.post("/uploadFile/:userId", upload.single("pdf-file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }
    console.log("file", req.file);
    await FileModel.create({
      name: req.file.filename,
      size: req.file.size,
      type: req.file.mimetype,
      userId: req.params.userId,
    });
    const loader = new PDFLoader(req.file.path);
    const docs = await loader.load();

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 100,
    });

    const splits = await textSplitter.splitDocuments(docs);

    await PineconeStore.fromDocuments(splits, embeddings, {
      pineconeIndex: index,
      namespace: req.params.userId,
    });

    res.send("File uploaded successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error uploading file");
  }
});

app.get("/uploadFile/:userId", async (req, res) => {
  try {
    const files = await FileModel.find({ userId: req.params.userId });
    if (!files) {
      return res.status(404).json(returnError(false, "File not found", 404));
    }

    res.status(200).json(returnSuccess(files, true, "File found", 200));
  } catch (error) {
    res.status(500).send("Error uploading file");
  }
});

app.post("/chat/:userId", async (req, res) => {
  try {
    await ChatModel.create({
      content: req.body.content,
      sender: "user",
      userId: req.params.userId,
    });
    const vectorStorage = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
      namespace: req.params.userId,
    });

    const retriever = vectorStorage.asRetriever(3);
    const docs = await retriever.invoke(req.body.content);

    const llm = new ChatMistralAI({
      model: "mistral-small-latest",
      apiKey: process.env.MISTRAL_API_KEY,
    });

    const context = docs.map((d) => d.pageContent).join("\n\n");

    const response = await llm.invoke([
      {
        role: "system",
        content: "You are a helpful assistant answering questions from a PDF.",
      },
      {
        role: "user",
        content: `Context from PDF:\n${context}\n\nQuestion: ${req.body.content}`,
      },
    ]);

    const chatResponse = await ChatModel.create({
      content: response.content,
      sender: "ai",
      userId: req.params.userId,
    });

    res
      .status(200)
      .json(returnSuccess(chatResponse, true, "Chat created", 200));
  } catch (error) {
    console.error(error);
    res.status(500).json(returnError(false, "Chat not created", 500));
  }
});

app.get("/chat/:userId", async (req, res) => {
  try {
    const findChat = await ChatModel.find({ userId: req.params.userId });
    res.status(200).json(returnSuccess(findChat, true, "Chat found", 200));
  } catch (error) {
    res.status(500).json(returnError(false, "Chat not found", 500));
  }
});

async function isExistNamespace(namespace) {
  const status = await index.describeIndexStats();
  return Object.keys(status.namespaces || {}).includes(namespace);
}

app.delete("/deleteFile/:userId", async (req, res) => {
  try {
    const namespace = req.params.userId;
    const exists = await isExistNamespace(namespace);
    if (!exists) {
      return res.status(404).send("Namespace not found");
    }
    await index.namespace(namespace).deleteAll();
    await FileModel.deleteMany({ userId: namespace });
    await ChatModel.deleteMany({ userId: namespace });
    res
      .status(200)
      .json(returnSuccess(null, true, "File data deleted successfully", 200));
  } catch (error) {
    console.error(error);
    res.status(500).json(returnError(false, "Chat not created", 500));
  }
});

app.get("test", (req, res) => {
  res
    .status(200)
    .json(returnSuccess(null, true, "Text data fetched successfully", 200));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
