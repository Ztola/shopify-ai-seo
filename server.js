const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// --------------------- ROUTES ---------------------
const shopDataRoute = require("./routes/shop-data");
const seoRoutes = require("./routes/seo");
const blogRoutes = require("./routes/blogs");
const autoBlogRoutes = require("./routes/auto-blog");

// Ordre important :
app.use("/api", shopDataRoute);
app.use("/api", seoRoutes);
app.use("/api", blogRoutes);
app.use("/api", autoBlogRoutes);

// Test
app.get("/", (req, res) => {
  res.send("🔥 Shopify AI SEO Server is running!");
});

// --------------------- SERVER ---------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
