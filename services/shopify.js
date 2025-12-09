const axios = require("axios");

// Debug URL au démarrage
console.log(
  "🔍 Testing Shopify URL:",
  `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products.json`
);

// ------------------------------------------------------
// Instance Shopify
// ------------------------------------------------------
const shopify = axios.create({
  baseURL: `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

// ------------------------------------------------------
// AUTO RATE LIMITER Shopify (évite erreur 429)
// ------------------------------------------------------
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let lastCall = 0;
const MIN_DELAY = 500; // 2 requêtes par seconde

shopify.interceptors.request.use(async config => {
  const now = Date.now();
  const timeSinceLastCall = now - lastCall;

  if (timeSinceLastCall < MIN_DELAY) {
    await wait(MIN_DELAY - timeSinceLastCall);
  }

  lastCall = Date.now();
  return config;
});

// ------------------------------------------------------
// Récupérer un produit
// ------------------------------------------------------
async function getProductById(id) {
  const res = await shopify.get(`/products/${id}.json`);
  return res.data.product;
}

// ------------------------------------------------------
// Récupérer la collection principale d’un produit
// ------------------------------------------------------
async function getProductCollection(productId) {
  const collects = await shopify.get(`/collects.json?product_id=${productId}`);

  if (!collects.data.collects || collects.data.collects.length === 0) {
    return null;
  }

  const collectionId = collects.data.collects[0].collection_id;
  const collection = await shopify.get(`/collections/${collectionId}.json`);

  return collection.data.collection;
}

// ------------------------------------------------------
// Mettre à jour un produit
// ------------------------------------------------------
async function updateProduct(id, data) {
  await shopify.put(`/products/${id}.json`, {
    product: {
      id,
      title: data.title,
      body_html: data.body_html,
      handle: data.handle
    }
  });
}

// ------------------------------------------------------
// Marquer un produit comme optimisé
// ------------------------------------------------------
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

// ------------------------------------------------------
// Vérifier si déjà optimisé
// ------------------------------------------------------
async function isAlreadyOptimized(productId) {
  const res = await shopify.get(`/products/${productId}/metafields.json`);

  return res.data.metafields.some(
    (m) =>
      m.namespace === "ai_seo" &&
      m.key === "optimized" &&
      m.value === "true"
  );
}

// ------------------------------------------------------
// Récupérer toutes les collections
// ------------------------------------------------------
async function getAllCollections() {
  const custom = await shopify.get(`/custom_collections.json?limit=250`);
  const smart = await shopify.get(`/smart_collections.json?limit=250`);

  return [
    ...custom.data.custom_collections,
    ...smart.data.smart_collections
  ];
}

// ------------------------------------------------------
// Récupérer tous les produits (pagination)
// ------------------------------------------------------
async function getAllProducts() {
  let products = [];
  let url = `/products.json?limit=250`;

  while (url) {
    const res = await shopify.get(url);
    products = products.concat(res.data.products);

    const linkHeader = res.headers["link"];

    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextUrl = linkHeader
        .split(",")
        .find((s) => s.includes('rel="next"'))
        .match(/<(.+?)>/)[1]
        .replace(/^https:\/\/[^/]+\/admin\/api\/2024-01/, "");
      url = nextUrl;
    } else {
      url = null;
    }
  }

  return products;
}

// ------------------------------------------------------
// Produits d’une collection
// ------------------------------------------------------
async function getProductsByCollection(collectionId) {
  const res = await shopify.get(
    `/collections/${collectionId}/products.json?limit=250`
  );
  return res.data.products;
}

// ------------------------------------------------------
// Récupérer tous les blogs
// ------------------------------------------------------
async function getAllBlogs() {
  const res = await shopify.get(`/blogs.json`);
  return res.data.blogs;
}

// ------------------------------------------------------
// Articles d’un blog
// ------------------------------------------------------
async function getArticlesByBlog(blogId) {
  let articles = [];
  let url = `/blogs/${blogId}/articles.json?limit=250`;

  while (url) {
    const res = await shopify.get(url);
    articles = articles.concat(res.data.articles);

    const linkHeader = res.headers["link"];
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextUrl = linkHeader
        .split(",")
        .find((s) => s.includes('rel="next"'))
        .match(/<(.+?)>/)[1]
        .replace(/^https:\/\/[^/]+\/admin\/api\/2024-01/, "");
      url = nextUrl;
    } else {
      url = null;
    }
  }

  return articles;
}

// ------------------------------------------------------
// EXPORTS
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
  getArticlesByBlog
};
