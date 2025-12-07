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
  // 1) On récupère le collect (relation produit <-> collection)
  const collects = await shopify.get(`/collects.json?product_id=${productId}`);

  if (!collects.data.collects || collects.data.collects.length === 0) {
    return null;
  }

  const collectionId = collects.data.collects[0].collection_id;

  // 2) On récupère la collection elle-même
  const collection = await shopify.get(`/collections/${collectionId}.json`);

  return collection.data.collection;
}

// --- Mettre à jour le produit ---
async function updateProduct(id, data) {
  await shopify.put(`/products/${id}.json`, {
    product: {
      id,
      title: data.title,
      body_html: data.body_html
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

module.exports = {
  getProductById,
  getProductCollection,
  updateProduct
  markAsOptimized
  async function isAlreadyOptimized(productId) {
  const res = await shopify.get(`/products/${productId}/metafields.json`);

  return res.data.metafields.some(
    (m) =>
      m.namespace === "ai_seo" &&
      m.key === "optimized" &&
      m.value === "true"
  );
}
};
