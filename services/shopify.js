const axios = require("axios");

// Instance Shopify
const shopify = axios.create({
  baseURL: `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01`,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

async function getProductById(id) {
  const res = await shopify.get(`/products/${id}.json`);
  return res.data.product;
}

async function getProductCollection(id) {
  const res = await shopify.get(`/products/${id}/collections.json`);

  if (!res.data.collections || res.data.collections.length === 0) {
    return null;
  }

  return res.data.collections[0];
}

async function updateProduct(id, data) {
  await shopify.put(`/products/${id}.json`, {
    product: {
      id,
      title: data.title,
      body_html: data.body_html
    }
  });
}

module.exports = {
  getProductById,
  getProductCollection,
  updateProduct
};
