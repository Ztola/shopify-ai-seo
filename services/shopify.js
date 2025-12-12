// ============================================================
// 🔥 Shopify Service — Version PRO Multi-Boutiques
// ============================================================
// Toutes les fonctions Shopify utilisent automatiquement
// la boutique envoyée par WordPress via :
//    x-shopify-url
//    x-shopify-token
//
// Si rien n’est envoyé → fallback .env
// ============================================================

const axios = require("axios");

// ------------------------------------------------------------
// 🔥 CLIENT DYNAMIQUE SHOPIFY (REQ → boutique active)
// ------------------------------------------------------------
function createDynamicClient(shopUrl, token) {
  return axios.create({
    baseURL: `https://${shopUrl}/admin/api/2024-01`,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json"
    }
  });
}

function getShopifyClient(req) {
  const shopUrl =
    req?.headers?.["x-shopify-url"] || process.env.SHOPIFY_SHOP_URL;

  const token =
    req?.headers?.["x-shopify-token"] || process.env.SHOPIFY_ACCESS_TOKEN;

  return createDynamicClient(shopUrl, token);
}

// ------------------------------------------------------------
// 🔥 Anti erreur 429 Shopify (Rate Limiter)
// ------------------------------------------------------------
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimiter(client, config) {
  if (!client._lastCall) client._lastCall = 0;

  const now = Date.now();
  const diff = now - client._lastCall;

  if (diff < 500) {
    await wait(500 - diff);
  }

  client._lastCall = Date.now();
  return config;
}

// ============================================================
// 📌 FONCTIONS SHOPIFY (Toutes acceptent req !!!)
// ============================================================

// ------------------------------------------------------------
// 🔥 1) GET PRODUCT BY ID
// ------------------------------------------------------------
async function getProductById(req, id) {
  const client = getShopifyClient(req);
  client.interceptors.request.use((c) => rateLimiter(client, c));

  const res = await client.get(`/products/${id}.json`);
  return res.data.product;
}

// ------------------------------------------------------------
// 🔥 2) GET COLLECTION OF A PRODUCT
// ------------------------------------------------------------
async function getProductCollection(req, productId) {
  const client = getShopifyClient(req);
  client.interceptors.request.use((c) => rateLimiter(client, c));

  const collects = await client.get(
    `/collects.json?product_id=${productId}`
  );

  if (!collects.data.collects?.length) return null;

  const collectionId = collects.data.collects[0].collection_id;
  const res = await client.get(`/collections/${collectionId}.json`);

  return res.data.collection;
}

// ------------------------------------------------------------
// 🔥 3) UPDATE A PRODUCT
// ------------------------------------------------------------
async function updateProduct(req, id, data) {
  const client = getShopifyClient(req);
  client.interceptors.request.use((c) => rateLimiter(client, c));

  await client.put(`/products/${id}.json`, {
    product: {
      id,
      title: data.title,
      body_html: data.body_html,
      handle: data.handle
    }
  });
}

// ------------------------------------------------------------
// 🔥 4) MARK PRODUCT AS OPTIMIZED (tags + metafield)
// ------------------------------------------------------------
async function markAsOptimized(req, productId) {
  const client = getShopifyClient(req);
  client.interceptors.request.use((c) => rateLimiter(client, c));

  const res = await client.get(`/products/${productId}.json`);
  const product = res.data.product;

  let tags = product.tags ? product.tags.split(",").map(t => t.trim()) : [];

  if (!tags.includes("optimized")) tags.push("optimized");

  // Update TAGS
  await client.put(`/products/${productId}.json`, {
    product: { id: productId, tags: tags.join(", ") }
  });

  // Add metafield
  await client.post(`/metafields.json`, {
    metafield: {
      namespace: "ai_seo",
      key: "optimized",
      value: "true",
      type: "single_line_text_field",
      owner_resource: "product",
      owner_id: productId
    }
  });

  return true;
}

// ------------------------------------------------------------
// 🔥 5) CHECK IF PRODUCT ALREADY OPTIMIZED
// ------------------------------------------------------------
async function isAlreadyOptimized(req, productId) {
  const client = getShopifyClient(req);
  client.interceptors.request.use((c) => rateLimiter(client, c));

  const res = await client.get(`/products/${productId}/metafields.json`);

  return res.data.metafields.some(
    (m) =>
      m.namespace === "ai_seo" &&
      m.key === "optimized" &&
      m.value === "true"
  );
}

// ------------------------------------------------------------
// 🔥 6) GET ALL COLLECTIONS (custom + smart)
// ------------------------------------------------------------
async function getAllCollections(req) {
  const client = getShopifyClient(req);
  client.interceptors.request.use((c) => rateLimiter(client, c));

  const custom = await client.get(`/custom_collections.json?limit=250`);
  const smart = await client.get(`/smart_collections.json?limit=250`);

  return [
    ...(custom.data.custom_collections || []),
    ...(smart.data.smart_collections || [])
  ];
}

// ------------------------------------------------------------
// 🔥 GET PRODUCTS PAGE (ADMIN UI SAFE)
// ------------------------------------------------------------
async function getProductsPage(req, limit = 50, pageInfo = null) {
  const client = getShopifyClient(req);
  client.interceptors.request.use((c) => rateLimiter(client, c));

  let url = `/products.json?limit=${limit}`;

  if (pageInfo) {
    url += `&page_info=${pageInfo}`;
  }

  const res = await client.get(url);

  const link = res.headers["link"];
  let nextPageInfo = null;

  if (link && link.includes('rel="next"')) {
    nextPageInfo = link
      .split(",")
      .find((s) => s.includes('rel="next"'))
      .match(/page_info=([^&>]+)/)[1];
  }

  return {
    products: res.data.products || [],
    nextPageInfo
  };
}


// ------------------------------------------------------------
// 🔥 8) GET PRODUCTS OF A COLLECTION
// ------------------------------------------------------------
async function getProductsByCollection(req, collectionId) {
  const client = getShopifyClient(req);
  client.interceptors.request.use((c) => rateLimiter(client, c));

  const res = await client.get(
    `/collections/${collectionId}/products.json?limit=250`
  );

  return res.data.products || [];
}

// ------------------------------------------------------------
// 🔥 9) BLOGS
// ------------------------------------------------------------
async function getAllBlogs(req) {
  const client = getShopifyClient(req);
  client.interceptors.request.use((c) => rateLimiter(client, c));

  const res = await client.get(`/blogs.json`);
  return res.data.blogs || [];
}

async function getArticlesByBlog(req, blogId) {
  const client = getShopifyClient(req);
  client.interceptors.request.use((c) => rateLimiter(client, c));

  let articles = [];
  let url = `/articles.json?blog_id=${blogId}&limit=250`;

  while (url) {
    const res = await client.get(url);

    if (!res.data.articles) break;
    articles = articles.concat(res.data.articles);

    const link = res.headers["link"];
    if (link && link.includes('rel="next"')) {
      url = link
        .split(",")
        .find((s) => s.includes('rel="next"'))
        .match(/<(.+?)>/)[1]
        .replace(/^https:\/\/[^/]+\/admin\/api\/2024-01/, "");
    } else url = null;
  }

  return articles;
}

async function createBlogArticle(req, blogId, article) {
  const client = getShopifyClient(req);
  client.interceptors.request.use((c) => rateLimiter(client, c));

  const res = await client.post(`/articles.json`, {
    article: { ...article, blog_id: blogId }
  });

  return res.data.article;
}

// ------------------------------------------------------------
// 🔥 GET PRODUCTS FOR VIEW (UP TO 1000 MAX)
// ------------------------------------------------------------
async function getProductsForView(req, max = 1000) {
  const client = getShopifyClient(req);
  client.interceptors.request.use((c) => rateLimiter(client, c));

  let products = [];
  let url = `/products.json?limit=250`;

  while (url && products.length < max) {
    const res = await client.get(url);
    products = products.concat(res.data.products);

    const link = res.headers["link"];
    if (link && link.includes('rel="next"')) {
      url = link
        .split(",")
        .find((s) => s.includes('rel="next"'))
        ?.match(/<(.+?)>/)?.[1]
        ?.replace(/^https:\/\/[^/]+\/admin\/api\/2024-01/, "");
    } else {
      url = null;
    }
  }

  return products.slice(0, max);
}


// ============================================================
// 🔥 EXPORTS
// ============================================================
module.exports = {
  // PRODUITS
  getProductById,
  getProductCollection,
  updateProduct,
  markAsOptimized,
  isAlreadyOptimized,

  // AFFICHAGE / ADMIN
  getProductsPage,
  getProductsForView,

  // FULL / IA
  getAllProducts,

  // COLLECTIONS
  getAllCollections,
  getProductsByCollection,

  // BLOG
  getAllBlogs,
  getArticlesByBlog,
  createBlogArticle
};
