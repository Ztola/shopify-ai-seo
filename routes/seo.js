const express = require("express");
const router = express.Router();

const {
  getAllProducts,
  getAllCollections,
  getAllBlogs,
  getProductsByCollection,
  getArticlesByBlog,
  getProductById
} = require("../services/shopify");

// ------------------------------
// GET /api/shop-data
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

    for (const blog of blogs) {
      const articles = await getArticlesByBlog(blog.id);

      data.blogs[blog.handle] = {
        id: blog.id,
        title: blog.title,
        handle: blog.handle,
        articles: articles.map(a => ({
          id: a.id,
          title: a.title,
          handle: a.handle
        }))
      };
    }

    res.json({
      success: true,
      total_products: products.length,
      total_collections: collections.length,
      total_blogs: blogs.length,
      data
    });

  } catch (error) {
    console.error("❌ Error shop-data:", error);
    res.status(500).json({ error: "Shop data error", details: error.message });
  }
});

// ---------------------------------------
// POST /api/optimize-product
// ---------------------------------------
router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId)
      return res.status(400).json({ error: "Missing productId" });

    const product = await getProductById(productId);

    if (!product)
      return res.status(404).json({ error: "Product not found" });

    res.json({
      success: true,
      original_title: product.title,
      optimized_title: "✨ Optimized: " + product.title
    });

  } catch (err) {
    console.error("❌ Error optimize-product:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
