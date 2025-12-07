const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const seoRoutes = require("./routes/seo");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// Routes API
app.use("/api", seoRoutes);

// Route test
app.get("/", (req, res) => {
  res.send("🔥 Shopify AI SEO App is running on Render!");
});

// Render utilise PORT automatiquement
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
