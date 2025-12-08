const {
  getAllProducts,
  getAllCollections,
  getProductsByCollection,
  getAllBlogs,
  getArticlesByBlog
} = require("./shopify");

let SHOP_CACHE = null;
let lastRefresh = null;

// -------------------------------------------------------
// 🎯 Fonction : Recharge entièrement le cache Shopify
// -------------------------------------------------------
async function refreshShopCache() {
  console.log("🔄 Refresh du cache Shopify…");

  const products = await getAllProducts();
  const collections = await getAllCollections();
  const blogs = await getAllBlogs();

  let data = {
    collections: {},
    blogs: {}
  };

  // COLLECTIONS structurées
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

  // BLOGS structurés
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

  SHOP_CACHE = data;
  lastRefresh = new Date();

  console.log("✅ Cache Shopify mis à jour !");
  return SHOP_CACHE;
}

// -------------------------------------------------------
// 🎯 Fonction : Get cache (ou refresh si vide)
// -------------------------------------------------------
async function getShopCache() {
  if (!SHOP_CACHE) {
    return await refreshShopCache();
  }
  return SHOP_CACHE;
}

// -------------------------------------------------------
module.exports = {
  refreshShopCache,
  getShopCache,
  lastRefresh
};
