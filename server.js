const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// 🔥 Import des routes SEO
const seoRoutes = require("./routes/seo");

// Toutes les routes API commencent ici
app.use("/api", seoRoutes);

// Route test
app.get("/", (req, res) => {
  res.send("🔥 Shopify AI SEO Server is running!");
});

// PORT Render obligatoire
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
