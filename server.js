const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const seoRoutes = require("./routes/seo");
const shopDataRoutes = require("./routes/shop-data");

const app = express();

app.use(cors());
app.use(express.json());

// ⚠️ IMPORTANT : Monte toutes les routes de SEO sous /api
app.use("/api", seoRoutes);
app.use("/api", shopDataRoutes);

// Route de test
app.get("/", (req, res) => {
  res.send("🔥 Render API running");
});

// Render utilise un port dynamique
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("🚀 API running on port", port));
