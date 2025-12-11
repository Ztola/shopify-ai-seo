// ============================================================
// 🔥 SERVER.JS — Version PRO Multi-Boutiques Shopify
// ============================================================

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");

dotenv.config();

const app = express();

// ------------------------------------------------------------
// 🔥 MIDDLEWARES GLOBAUX
// ------------------------------------------------------------
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "x-shopify-url",
    "x-shopify-token"
  ]
}));

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));


// ------------------------------------------------------------
// 🔥 ROUTES À IMPORTER
// ------------------------------------------------------------
const shopDataRoute = require("./routes/shop-data");   // 🔥 Priorité 1
const seoRoutes      = require("./routes/seo");        // 🔥 Priorité 2
const blogRoutes     = require("./routes/blogs");      // 🔥 Priorité 3
const autoBlogRoutes = require("./routes/auto-blog");  // Optionnel


// ------------------------------------------------------------
// 🔥 ENREGISTREMENT DES ROUTES DANS LE BON ORDRE
// ------------------------------------------------------------
// ⚠ Toujours mettre shop-data en premier sinon les collections
// et produits ne se chargent pas correctement
app.use("/api", shopDataRoute);

// SEO (optimisation produits, collections, metas…)
app.use("/api", seoRoutes);

// Blogs & auto-blog
app.use("/api", blogRoutes);
app.use("/api", autoBlogRoutes);


// ------------------------------------------------------------
// 🔥 PAGE TEST ROOT
// ------------------------------------------------------------
app.get("/", (req, res) => {
  res.send(`
    <h1>🔥 Shopify AI SEO Server is running!</h1>
    <p>Instance: ${process.env.RENDER_SERVICE_NAME || "Local"}</p>
  `);
});


// ------------------------------------------------------------
// 🔥 ERREUR GLOBALE (Sécurité + Debug)
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err);
  res.status(500).json({
    success: false,
    error: err.message || "Internal Server Error"
  });
});


// ------------------------------------------------------------
// 🔥 LANCEMENT DU SERVEUR
// ------------------------------------------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
