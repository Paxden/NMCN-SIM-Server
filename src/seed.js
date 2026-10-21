import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "./models/User.js";

const { ADMIN_EMAIL, ADMIN_PASSWORD, MONGO_URI } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MONGO_URI) { console.error("Set ADMIN_EMAIL, ADMIN_PASSWORD and MONGO_URI in .env"); process.exit(1); }
await mongoose.connect(MONGO_URI);
const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
if (existing) console.log("Admin already exists:", existing.email);
else {
  await User.create({ name: "Administrator", email: ADMIN_EMAIL, role: "admin", passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10) });
  console.log("Admin created:", ADMIN_EMAIL);
}
await mongoose.disconnect();
