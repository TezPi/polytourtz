import { createVercelApp } from "../src/vercel/app.js";
import { createBlobRoomStore } from "../src/vercel/blob-store.js";
import { createMemoryRoomStore } from "../src/vercel/store.js";

const store = process.env.BLOB_READ_WRITE_TOKEN
  ? createBlobRoomStore()
  : createMemoryRoomStore();

export default createVercelApp(store);
