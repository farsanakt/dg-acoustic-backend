require("dotenv").config();
const app       = require("./src/app");
const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀  Server  →  http://localhost:${PORT}`);
      console.log(`🌍  Env     →  ${process.env.NODE_ENV}`);
      console.log(`📦  DB      →  ${process.env.MONGO_URI}`);
    });
  })
  .catch((err) => {
    console.error("❌  DB connection failed:", err.message);
    process.exit(1);
  });
