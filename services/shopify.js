const axios = require("axios");

// ------------------------------------------------------
// DEBUG URL AU DÉMARRAGE
// ------------------------------------------------------
console.log(
  "🔍 Testing Shopify URL:",
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
// AUTO RATE LIMITER Shopify (évite erreur 429)
// ------------------------------------------------------
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let lastCall = 0;
const MIN_DELAY = 500; // 2 requêtes par seconde max

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
// 🔥 RÉCUPÉRER UN PRODUIT
// ------------------------------------------------------
async function getProductById(id) {
  const res = await shopify.get(`/products/${id}.json`);
  return res.data.product;
}

// ------------------------------------------------------
// 🔥 RÉCUPÉRER COLLECTION D’UN PRODUIT
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
// 🔥 METTRE À JOUR UN PRODUIT
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
// 🔥 MARQUER UN PRODUIT COMME OPTIMISÉ (TAG + METAFIELD)
// ------------------------------------------------------
async function markAsOptimized(productId) {
  console.log("🔖 Marquage du produit comme optimisé…");

  // 1️⃣ Récupérer le produit
  const res = await shopify.get(`/products/${productId}.json`);
  const product = res.data.product;

  let currentTags = product.tags ? product.tags.split(",") : [];

  // 2️⃣ Ajouter le tag s'il n’existe pas
  const cleanTags = currentTags.map(t => t.trim());
  if (!cleanTags.includes("optimized")) {
    cleanTags.push("optimized");
  }

  // 3️⃣ Mise à jour du produit avec nouveau tag
  await shopify.put(`/products/${productId}.json`, {
    product: {
      id: productId,
      tags: cleanTags.join(", ")
    }
  });

  // 4️⃣ Ajouter aussi le Metafield (optionnel)
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

  console.log("✔ Produit marqué optimisé (Tag + Metafield)");
}

// ------------------------------------------------------
// 🔥 VÉRIFIER SI DÉJÀ OPTIMISÉ
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
// 🔥 TOUTES LES COLLECTIONS
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
// 🔥 TOUS LES PRODUITS (pagination Shopify)
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
// 🔥 PRODUITS D’UNE COLLECTION
// ------------------------------------------------------
async function getProductsByCollection(collectionId) {
  const res = await shopify.get(
    `/collections/${collectionId}/products.json?limit=250`
  );
  return res.data.products;
}

// ------------------------------------------------------
// 🔥 BLOGS
// ------------------------------------------------------
async function getAllBlogs() {
  const res = await shopify.get(`/blogs.json`);
  return res.data.blogs;
}

// ------------------------------------------------------
// 🔥 ARTICLES DE BLOG (pagination)
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
