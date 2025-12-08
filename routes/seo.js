router.get("/shop-data", async (req, res) => {
  try {
    console.log("📦 Scraping complet de la boutique…");

    // Récupération brute
    const products = await getAllProducts();
    const collections = await getAllCollections();
    const blogs = await getAllBlogs();

    let data = {
      collections: {},
      blogs: {}
    };

    // -------------------------
    // 📌 COLLECTIONS STRUCTURÉES
    // -------------------------
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

    // -------------------------
    // 📌 BLOGS STRUCTURÉS
    // -------------------------
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
    console.error("❌ Error shop-data:", error);
    res.status(500).json({
      error: "Failed to load shop data",
      details: error.message
    });
  }
});
