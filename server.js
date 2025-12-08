const express = require("express");
const cors = require("cors");
const seoRoutes = require("./routes/seo");

const app = express();

app.use(cors());
app.use(express.json());

// IMPORTANT : Ceci crée /api/...
app.use("/api", seoRoutes);

app.get("/", (req, res) => {
  res.send("🔥 Shopify AI SEO backend is running");
});

// Render gère PORT automatiquement
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
