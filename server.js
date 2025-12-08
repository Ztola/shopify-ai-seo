const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// IMPORT DES ROUTES SEO
const seoRoutes = require("./routes/seo");

// ROUTES API
app.use("/api", seoRoutes);

// ROUTE TEST
app.get("/", (req, res) => {
  res.send("🔥 Shopify AI SEO App is running on Render!");
});

// Render attribue automatiquement PORT
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
