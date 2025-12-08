const express = require("express");
const router = express.Router();

const {
  getAllProducts,
  getAllCollections,
  getAllBlogs,
  getProductsByCollection,
  getArticlesByBlog
} = require("../services/shopify");

// --------------------------------------------------
// GET /api/shop-data
// --------------------------------------------------
router.get("/shop-data", async (req, res) => {
  try {
    const products = await getAllProducts();
    const collections = await getAllCollections();
    const blogs = await getAllBlogs();

    const data = { collections: {}, blogs: {} };

    // -------- Collections + produits --------
    for (const col of collections) {
      const colProducts = await getProductsByCollection(col.id);

      data.collections[col.handle] = {
        id: col.id,
        title: col.title,
        handle: col.handle,
        products: colProducts.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          optimized: p.tags?.includes("optimized") || false
        }))
      };
    }

    // -------- Blogs + articles --------
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

    return res.json({
      success: true,
      total_products: products.length,
      total_collections: collections.length,
      total_blogs: blogs.length,
      data
    });

  } catch (err) {
    console.error("❌ Error /shop-data :", err);
    res.status(500).json({ error: "shop-data error", details: err.message });
  }
});

module.exports = router;
