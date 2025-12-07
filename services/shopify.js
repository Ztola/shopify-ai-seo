const axios = require("axios");

// Instance Shopify
const shopify = axios.create({
  baseURL: `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

// --- Récupérer un produit ---
async function getProductById(id) {
  const res = await shopify.get(`/products/${id}.json`);
  return res.data.product;
}

// --- Récupérer la collection principale d’un produit ---
async function getProductCollection(productId) {
  const collects = await shopify.get(`/collects.json?product_id=${productId}`);

  if (!collects.data.collects || collects.data.collects.length === 0) {
    return null;
  }

  const collectionId = collects.data.collects[0].collection_id;
  const collection = await shopify.get(`/collections/${collectionId}.json`);

  return collection.data.collection;
}

// --- Mettre à jour le produit ---
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

// --- Ajouter un metafield : produit optimisé ---
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

// --- Vérifier si le produit est déjà optimisé ---
async function isAlreadyOptimized(productId) {
  const res = await shopify.get(`/products/${productId}/metafields.json`);

  return res.data.metafields.some(
    (m) =>
      m.namespace === "ai_seo" &&
      m.key === "optimized" &&
      m.value === "true"
  );
}

/* ---------------------------------------------------------
   SCRAPING COMPLET POUR MAILLAGE INTERNE (PRODUITS, COLLECTIONS, BLOGS)
--------------------------------------------------------- */

// --- Récupérer TOUTES LES COLLECTIONS (custom + smart) ---
async function getAllCollections() {
  const custom = await shopify.get(`/custom_collections.json?limit=250`);
  const smart = await shopify.get(`/smart_collections.json?limit=250`);

  return [
    ...custom.data.custom_collections,
    ...smart.data.smart_collections
  ];
}

// --- Récupérer TOUS LES PRODUITS (pagination illimitée) ---
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
        .replace(
          `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01`,
          ""
        );
      url = nextUrl;
    } else {
      url = null;
    }
  }

  return products;
}

// --- Récupérer les produits d’une collection ---
async function getProductsByCollection(collectionId) {
  const res = await shopify.get(
    `/collections/${collectionId}/products.json?limit=250`
  );
  return res.data.products;
}

// --- Récupérer TOUS LES BLOGS ---
async function getAllBlogs() {
  const res = await shopify.get(`/blogs.json`);
  return res.data.blogs;
}

// --- Récupérer tous les articles d’un blog (pagination illimitée) ---
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
        .replace(
          `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01`,
          ""
        );
      url = nextUrl;
    } else {
      url = null;
    }
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
