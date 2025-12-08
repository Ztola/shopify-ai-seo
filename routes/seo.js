const express = require("express");
const router = express.Router();

// IMPORTS DES SERVICES
const { getShopCache, refreshShopCache } = require("../services/cache");
const {
  getAllProducts,
  getAllCollections,
  getAllBlogs,
  getProductsByCollection,
  getArticlesByBlog
} = require("../services/shopify");


// ------------------------------
// 📌 ROUTE : GET /api/shop-data
// ------------------------------
router.get("/shop-data", async (req, res) => {
  try {
    console.log("📦 Chargement complet de la boutique…");

    const products = await getAllProducts();
    const collections = await getAllCollections();
    const blogs = await getAllBlogs();

    let data = {
      collections: {},
      blogs: {}
    };

    // ----- COLLECTIONS -----
    for (const col of collections) {
      const colProducts = await getProductsByCollection(col.id);

      data.collections[col.handle] = {
        id: col.id,
        title: col.title,
        handle: col.handle,
        products: colProducts.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle
        }))
      };
    }

    // ----- BLOGS -----
    for (const blog of blogs) {
      const articles = await getArticlesByBlog(blog.id);

      data.blogs[blog.handle] = {
        id: blog.id,
        title: blog.title,
        handle: blog.handle,
        articles: articles.map(a => ({
          id: a.id,
          title: a.title,
          handle: a.handle,
          blog_handle: blog.handle
        }))
      };
    }

    res.json({
      success: true,
      shop: process.env.SHOPIFY_SHOP_URL,
      total_products: products.length,
      total_collections: collections.length,
      total_blogs: blogs.length,
      data
    });

  } catch (error) {
    console.error("❌ Error /shop-data:", error);
    res.status(500).json({
      error: "Failed to load shop data",
      details: error.message
    });
  }
});


// ----------------------------------
// 📌 ROUTE : POST /api/optimize
// ----------------------------------
router.post("/optimize", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Missing 'text' in request body" });
    }

    // ⚠️ Ici tu mettras ton appel IA (OpenAI, Gemini, etc.)
    // Pour l’instant on renvoie un résultat simple
    const optimized = `✨ Optimized result: ${text}`;

    res.json({
      success: true,
      optimized
    });

  } catch (error) {
    console.error("❌ Error /optimize:", error);
    res.status(500).json({
      error: "Failed to optimize content",
      details: error.message
    });
  }
});


// EXPORT ROUTER
module.exports = router;
