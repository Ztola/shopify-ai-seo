// ------------------------------------------------------
// 🔥 Shopify Multi-Boutiques (SaaS Ready)
// ------------------------------------------------------
const axios = require("axios");

// ------------------------------------------------------
// 🔥 CLIENT SHOPIFY DYNAMIQUE (Important !)
// ------------------------------------------------------
function createDynamicClient(shopUrl, token) {
  return axios.create({
    baseURL: `https://${shopUrl}/admin/api/2024-01`,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json"
    }
  });
}

/**
 * Retourne le bon client :
 * - celui envoyé par WordPress (headers)
 * - sinon celui du .env
 */
function getShopifyClient(req) {
  const shopUrl = req?.headers?.["x-shopify-url"] || process.env.SHOPIFY_SHOP_URL;
  const token   = req?.headers?.["x-shopify-token"] || process.env.SHOPIFY_ACCESS_TOKEN;

  return createDynamicClient(shopUrl, token);
}

// ------------------------------------------------------
// AUTO RATE LIMITER Shopify (évite erreur 429)
// ------------------------------------------------------
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

// ------------------------------------------------------
// 🔥 /!\ TOUTES LES FONCTIONS ACCEPTENT MAINTENANT (req)
// ------------------------------------------------------

async function getProductById(req, id) {
  const client = getShopifyClient(req);
  client.interceptors.request.use(c => rateLimiter(client, c));

  const res = await client.get(`/products/${id}.json`);
  return res.data.product;
}

async function getProductCollection(req, productId) {
  const client = getShopifyClient(req);
  client.interceptors.request.use(c => rateLimiter(client, c));

  const collects = await client.get(`/collects.json?product_id=${productId}`);

  if (!collects.data.collects?.length) return null;

  const collectionId = collects.data.collects[0].collection_id;
  const res = await client.get(`/collections/${collectionId}.json`);
  return res.data.collection;
}

async function updateProduct(req, id, data) {
  const client = getShopifyClient(req);
  client.interceptors.request.use(c => rateLimiter(client, c));

  await client.put(`/products/${id}.json`, {
    product: {
      id,
      title: data.title,
      body_html: data.body_html,
      handle: data.handle
    }
  });
}

async function markAsOptimized(req, productId) {
  const client = getShopifyClient(req);
  client.interceptors.request.use(c => rateLimiter(client, c));

  const res = await client.get(`/products/${productId}.json`);
  const product = res.data.product;

  let tags = product.tags ? product.tags.split(",").map(t => t.trim()) : [];

  if (!tags.includes("optimized")) tags.push("optimized");

  await client.put(`/products/${productId}.json`, {
    product: { id: productId, tags: tags.join(", ") }
  });

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

async function isAlreadyOptimized(req, productId) {
  const client = getShopifyClient(req);
  client.interceptors.request.use(c => rateLimiter(client, c));

  const res = await client.get(`/products/${productId}/metafields.json`);

  return res.data.metafields.some(
    m => m.namespace === "ai_seo" && m.key === "optimized" && m.value === "true"
  );
}

async function getAllCollections(req) {
  const client = getShopifyClient(req);
  client.interceptors.request.use(c => rateLimiter(client, c));

  const custom = await client.get(`/custom_collections.json?limit=250`);
  const smart = await client.get(`/smart_collections.json?limit=250`);

  return [...custom.data.custom_collections, ...smart.data.smart_collections];
}

async function getAllProducts(req) {
  const client = getShopifyClient(req);
  client.interceptors.request.use(c => rateLimiter(client, c));

  let products = [];
  let url = `/products.json?limit=250`;

  while (url) {
    const res = await client.get(url);
    products = products.concat(res.data.products);

    const link = res.headers["link"];
    if (link && link.includes('rel="next"')) {
      url = link.split(",")
        .find(s => s.includes('rel="next"'))
        .match(/<(.+?)>/)[1]
        .replace(/^https:\/\/[^/]+\/admin\/api\/2024-01/, "");
    } else url = null;
  }

  return products;
}

async function getProductsByCollection(req, collectionId) {
  const client = getShopifyClient(req);
  client.interceptors.request.use(c => rateLimiter(client, c));

  const res = await client.get(`/collections/${collectionId}/products.json?limit=250`);
  return res.data.products;
}

async function getAllBlogs(req) {
  const client = getShopifyClient(req);
  client.interceptors.request.use(c => rateLimiter(client, c));

  const res = await client.get(`/blogs.json`);
  return res.data.blogs;
}

async function getArticlesByBlog(req, blogId) {
  const client = getShopifyClient(req);
  client.interceptors.request.use(c => rateLimiter(client, c));

  let articles = [];
  let url = `/articles.json?blog_id=${blogId}&limit=250`;

  while (url) {
    const res = await client.get(url);

    if (!res.data.articles) break;
    articles = articles.concat(res.data.articles);

    const link = res.headers["link"];
    if (link && link.includes('rel="next"')) {
      url = link.split(",")
        .find(s => s.includes('rel="next"'))
        .match(/<(.+?)>/)[1]
        .replace(/^https:\/\/[^/]+\/admin\/api\/2024-01/, "");
    } else url = null;
  }

  return articles;
}

async function createBlogArticle(req, blogId, article) {
  const client = getShopifyClient(req);
  client.interceptors.request.use(c => rateLimiter(client, c));

  const res = await client.post(`/articles.json`, {
    article: { ...article, blog_id: blogId }
  });

  return res.data.article;
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
  getArticlesByBlog,
  createBlogArticle,
};
