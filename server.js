const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// --------------------------------------------------------------------
// 🔥 Import des routes
// --------------------------------------------------------------------
const seoRoutes = require("./routes/seo");
const blogRoutes = require("./routes/blogs");
const shopDataRoute = require("./routes/shop-data");

// --------------------------------------------------------------------
// 🔥 Enregistrement des routes AVANT l'écoute du serveur
// --------------------------------------------------------------------
app.use("/api", seoRoutes);
app.use("/api", blogRoutes);
app.use("/api", shopDataRoute);

// --------------------------------------------------------------------
// 🔥 Route test
// --------------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("🔥 Shopify AI SEO Server is running!");
});

// --------------------------------------------------------------------
// 🔥 Lancement du serveur
// --------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
