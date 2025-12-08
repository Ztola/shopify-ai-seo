const axios = require("axios");

// Debug
console.log(
  "🔍 Testing Shopify URL:",
  `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products.json`
);

// Instance Shopify
const shopify = axios.create({
  baseURL: `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

/* ---------------------------------------------------------
   PRODUIT
--------------------------------------------------------- */

async function getProductById(id) {
  const res = await shopify.get(`/products/${id}.json`);
  return res.data.product;
}

async function getProductCollection(productId) {
  const collects = await shopify.get(`/collects.json?product_id=${productId}`);

  if (!collects.data.collects?.length) return null;

  const collectionId = collects.data.collects[0].collection_id;

  // ESSAI CUSTOM COLLECTION
  try {
    const col = await shopify.get(`/custom_collections/${collectionId}.json`);
    return col.data.custom_collection;
  } catch (e) {}

  // ESSAI SMART COLLECTION
  try {
    const col = await shopify.get(`/smart_collections/${collectionId}.json`);
    return col.data.smart_collection;
  } catch (e) {}

  return null;
}

async function updateProduct(id, data) {
  return shopify.put(`/products/${id}.json`, {
    product: {
      id,
      title: data.title,
      body_html: data.body_html,
      handle: data.handle
    }
  });
}

async function markAsOptimized(productId) {
  await shopify.post(`/metafields.json`, {
    metafield: {
      namespace: "ai_seo",
      key: "optimized",
      value: "true",
      type: "single_line_text_field",
      owner_resource: "product",
      owner_id: productId
    }
  });
}

async function isAlreadyOptimized(productId) {
  const res = await shopify.get(`/products/${productId}/metafields.json`);
  return res.data.metafields.some(
    (m) => m.namespace === "ai_seo" && m.key === "optimized"
  );
}

/* ---------------------------------------------------------
   PAGINATION STABLE (ZÉRO INVALID URL)
--------------------------------------------------------- */

function extractNextUrl(linkHeader) {
  if (!linkHeader) return null;

  const match = linkHeader.split(",").find(s => s.includes('rel="next"'));
  if (!match) return null;

  const url = match.match(/<(.+?)>/)[1];

  // Transforme l'URL entière en chemin API
  const clean = url.replace(`https://${process.env.SHOPIFY_SHOP_URL}`, "");

  return clean;
}

/* ---------------------------------------------------------
   SCRAPING COMPLET
--------------------------------------------------------- */

async function getAllProducts() {
  let products = [];
  let url = `/products.json?limit=250`;

  while (url) {
    const res = await shopify.get(url);
    products = products.concat(res.data.products);
    url = extractNextUrl(res.headers["link"]);
  }

  return products;
}

async function getAllCollections() {
  const custom = await shopify.get(`/custom_collections.json?limit=250`);
  const smart = await shopify.get(`/smart_collections.json?limit=250`);
  return [...custom.data.custom_collections, ...smart.data.smart_collections];
}

async function getProductsByCollection(collectionId) {
  const res = await shopify.get(
    `/collections/${collectionId}/products.json?limit=250`
  );
  return res.data.products;
}

async function getAllBlogs() {
  const res = await shopify.get(`/blogs.json`);
  return res.data.blogs;
}

async function getArticlesByBlog(blogId) {
  let articles = [];
  let url = `/blogs/${blogId}/articles.json?limit=250`;

  while (url) {
    const res = await shopify.get(url);
    articles = articles.concat(res.data.articles);
    url = extractNextUrl(res.headers["link"]);
  }

  return articles;
}

/* ---------------------------------------------------------
   EXPORTS
--------------------------------------------------------- */

module.exports = {
  getProductById,
  getProductCollection,
  updateProduct,
  markAsOptimized,
  isAlreadyOptimized,
  getAllProducts,
  getAllCollections,
  getProductsByCollection,
  getAllBlogs,
  getArticlesByBlog
};
