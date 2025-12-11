const axios = require("axios");

// ------------------------------------------------------
// DEBUG URL AU DÉMARRAGE
// ------------------------------------------------------
console.log(
  "🔍 Shopify API Test:",
  `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products.json`
);

// ------------------------------------------------------
// INSTANCE SHOPIFY
// ------------------------------------------------------
const shopify = axios.create({
  baseURL: `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

// ------------------------------------------------------
// AUTO RATE-LIMIT
// ------------------------------------------------------
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let lastCall = 0;
const MIN_DELAY = 500;

shopify.interceptors.request.use(async config => {
  const now = Date.now();
  if (now - lastCall < MIN_DELAY) {
    await wait(MIN_DELAY - (now - lastCall));
  }
  lastCall = Date.now();
  return config;
});

// ------------------------------------------------------
// PRODUITS
// ------------------------------------------------------
async function getProductById(id) {
  const res = await shopify.get(`/products/${id}.json`);
  return res.data.product;
}

async function getProductCollection(productId) {
  const collects = await shopify.get(`/collects.json?product_id=${productId}`);

  if (!collects.data.collects?.length) return null;

  const collectionId = collects.data.collects[0].collection_id;
  const collection = await shopify.get(`/collections/${collectionId}.json`);

  return collection.data.collection;
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
  // tag + metafield
  const res = await shopify.get(`/products/${productId}.json`);
  const product = res.data.product;

  let tags = product.tags ? product.tags.split(",").map(t => t.trim()) : [];
  if (!tags.includes("optimized")) tags.push("optimized");

  await shopify.put(`/products/${productId}.json`, {
    product: { id: productId, tags: tags.join(", ") }
  });

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
    (m) => m.namespace === "ai_seo" && m.key === "optimized" && m.value === "true"
  );
}

async function getAllProducts() {
  let products = [];
  let url = `/products.json?limit=250`;

  while (url) {
    const res = await shopify.get(url);
    products = products.concat(res.data.products);

    const link = res.headers["link"];
    if (link && link.includes('rel="next"')) {
      url = link
        .split(",")
        .find(s => s.includes('rel="next"'))
        .match(/<(.+?)>/)[1]
        .replace(/^https:\/\/[^/]+\/admin\/api\/2024-01/, "");
    } else {
      url = null;
    }
  }

  return products;
}

async function getAllCollections() {
  const custom = await shopify.get(`/custom_collections.json?limit=250`);
  const smart = await shopify.get(`/smart_collections.json?limit=250`);
  return [...custom.data.custom_collections, ...smart.data.smart_collections];
}

async function getProductsByCollection(collectionId) {
  const res = await shopify.get(`/collections/${collectionId}/products.json?limit=250`);
  return res.data.products || [];
}

// ------------------------------------------------------
// BLOGS
// ------------------------------------------------------
async function getAllBlogs() {
  const res = await shopify.get(`/blogs.json`);
  return res.data.blogs;
}

// ------------------------------------------------------
// ARTICLES (nouvelle API Shopify 2025)
// ------------------------------------------------------
async function getArticlesByBlog(blogId) {
  const res = await shopify.get(`/articles.json?blog_id=${blogId}&limit=250`);
  return res.data.articles || [];
}

// ------------------------------------------------------
// CRÉATION ARTICLE
// ------------------------------------------------------
async function createBlogArticle(blogId, article) {
  const res = await shopify.post(`/blogs/${blogId}/articles.json`, {
    article
  });
  return res.data.article;
}

// ------------------------------------------------------
// EXPORT
// ------------------------------------------------------
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
  getArticlesByBlog,
  createBlogArticle
};
