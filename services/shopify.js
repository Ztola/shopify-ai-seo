// ============================================================
// 🔥 Shopify Service — VERSION STABLE & PRO (ANTI 429)
// ============================================================
// ✔ Multi-boutique (headers x-shopify-url / x-shopify-token)
// ✔ Anti 429 Shopify (Bottleneck)
// ✔ Code propre, lisible, maintenable
// ============================================================

const axios = require("axios");
const Bottleneck = require("bottleneck");

// ============================================================
// ⏱️ LIMITER GLOBAL (ANTI 429 SHOPIFY)
// ============================================================
const limiter = new Bottleneck({
  minTime: 650,        // 1 requête toutes les 650ms
  maxConcurrent: 1
});

// ============================================================
// 🔌 CLIENT SHOPIFY DYNAMIQUE
// ============================================================
function createShopifyClient(shopUrl, token) {
  if (!shopUrl || !token) {
    throw new Error("Shopify credentials manquants");
  }

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

  return createShopifyClient(shopUrl, token);
}

// ============================================================
// 📦 PRODUITS
// ============================================================

// 🔹 1️⃣ Récupérer un produit
async function getProductById(req, productId) {
  const client = getShopifyClient(req);

  const res = await limiter.schedule(() =>
    client.get(`/products/${productId}.json`)
  );

  return res.data.product;
}

// 🔹 2️⃣ Mettre à jour un produit
async function updateProduct(req, productId, data) {
  const client = getShopifyClient(req);

  await limiter.schedule(() =>
    client.put(`/products/${productId}.json`, {
      product: {
        id: productId,
        title: data.title,
        handle: data.handle,
        body_html: data.body_html
      }
    })
  );
}

// 🔹 3️⃣ Marquer un produit comme optimisé
async function markAsOptimized(req, productId) {
  const client = getShopifyClient(req);

  const res = await limiter.schedule(() =>
    client.get(`/products/${productId}.json`)
  );

  const product = res.data.product;
  let tags = product.tags
    ? product.tags.split(",").map(t => t.trim())
    : [];

  if (!tags.includes("optimized")) tags.push("optimized");

  await limiter.schedule(() =>
    client.put(`/products/${productId}.json`, {
      product: {
        id: productId,
        tags: tags.join(", ")
      }
    })
  );

  await limiter.schedule(() =>
    client.post(`/metafields.json`, {
      metafield: {
        namespace: "ai_seo",
        key: "optimized",
        value: "true",
        type: "single_line_text_field",
        owner_resource: "product",
        owner_id: productId
      }
    })
  );

  return true;
}

// 🔹 4️⃣ Vérifier si déjà optimisé
async function isAlreadyOptimized(req, productId) {
  const client = getShopifyClient(req);

  const res = await limiter.schedule(() =>
    client.get(`/products/${productId}/metafields.json`)
  );

  return res.data.metafields.some(
    m =>
      m.namespace === "ai_seo" &&
      m.key === "optimized" &&
      m.value === "true"
  );
}

// ============================================================
// 📚 COLLECTIONS
// ============================================================

// 🔹 5️⃣ Toutes les collections (custom + smart)
async function getAllCollections(req) {
  const client = getShopifyClient(req);

  const custom = await limiter.schedule(() =>
    client.get(`/custom_collections.json?limit=250`)
  );

  const smart = await limiter.schedule(() =>
    client.get(`/smart_collections.json?limit=250`)
  );

  return [
    ...(custom.data.custom_collections || []),
    ...(smart.data.smart_collections || [])
  ];
}

// 🔹 6️⃣ Produits d’une collection
async function getProductsByCollection(req, collectionId) {
  const client = getShopifyClient(req);

  const res = await limiter.schedule(() =>
    client.get(`/collections/${collectionId}/products.json?limit=250`)
  );

  return res.data.products || [];
}

// ============================================================
// 🧾 PRODUITS (LISTES)
// ============================================================

// 🔹 7️⃣ Produits paginés (admin)
async function getProductsPage(req, limit = 50, pageInfo = null) {
  const client = getShopifyClient(req);

  let url = `/products.json?limit=${limit}`;
  if (pageInfo) url += `&page_info=${pageInfo}`;

  const res = await limiter.schedule(() => client.get(url));

  let nextPageInfo = null;
  const link = res.headers["link"];

  if (link && link.includes('rel="next"')) {
    nextPageInfo = link
      .split(",")
      .find(s => s.includes('rel="next"'))
      .match(/page_info=([^&>]+)/)[1];
  }

  return {
    products: res.data.products || [],
    nextPageInfo
  };
}

// 🔹 8️⃣ Produits pour affichage (max 1000)
async function getProductsForView(req, max = 1000) {
  const client = getShopifyClient(req);

  let products = [];
  let url = `/products.json?limit=250`;

  while (url && products.length < max) {
    const res = await limiter.schedule(() => client.get(url));
    products = products.concat(res.data.products || []);

    const link = res.headers["link"];
    if (link && link.includes('rel="next"')) {
      url = link
        .split(",")
        .find(s => s.includes('rel="next"'))
        ?.match(/<(.+?)>/)?.[1]
        ?.replace(/^https:\/\/[^/]+\/admin\/api\/2024-01/, "");
    } else {
      url = null;
    }
  }

  return products.slice(0, max);
}

// ============================================================
// 📝 BLOGS
// ============================================================

async function getAllBlogs(req) {
  const client = getShopifyClient(req);

  const res = await limiter.schedule(() =>
    client.get(`/blogs.json`)
  );

  return res.data.blogs || [];
}

async function getArticlesByBlog(req, blogId) {
  const client = getShopifyClient(req);

  let articles = [];
  let url = `/articles.json?blog_id=${blogId}&limit=250`;

  while (url) {
    const res = await limiter.schedule(() => client.get(url));
    articles = articles.concat(res.data.articles || []);

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

  return articles;
}

async function createBlogArticle(req, blogId, article) {
  const client = getShopifyClient(req);

  const res = await limiter.schedule(() =>
    client.post(`/articles.json`, {
      article: { ...article, blog_id: blogId }
    })
  );

  return res.data.article;
}

// ============================================================
// 🔥 EXPORTS
// ============================================================
module.exports = {
  // Produits
  getProductById,
  updateProduct,
  markAsOptimized,
  isAlreadyOptimized,

  // Collections
  getAllCollections,
  getProductsByCollection,

  // Listes produits
  getProductsPage,
  getProductsForView,

  // Blogs
  getAllBlogs,
  getArticlesByBlog,
  createBlogArticle
};
