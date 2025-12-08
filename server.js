require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ----------------------
// IMPORT ROUTES
// ----------------------
const seoRoutes = require("./routes/seo");
const shopDataRoutes = require("./routes/shop-data");

// ----------------------
// MOUNT ROUTES
// ----------------------
app.use("/api", seoRoutes);
app.use("/api", shopDataRoutes);

// ----------------------
// ROOT TEST
// ----------------------
app.get("/", (req, res) => {
  res.send("Shopify AI Booster API — Running ✔");
});

// ----------------------
// START SERVER
// ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 API running on port", PORT);
});
