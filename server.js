const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// 🔥 Import des routes SEO
const seoRoutes = require("./routes/seo");

// 🔥 Import des routes Blog (NOUVEAU)
const blogRoutes = require("./routes/blogs");

// Toutes les routes API commencent ici
app.use("/api", seoRoutes);

// 👉 Ajout des routes Blog
app.use("/api", blogRoutes);

// Route test
app.get("/", (req, res) => {
  res.send("🔥 Shopify AI SEO Server is running!");
});

// PORT Render obligatoire
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
