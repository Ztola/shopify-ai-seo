// =============================================================
// 🧠 SEO.JS — VERSION FINALE COMPLÈTE & STABLE
// =============================================================

const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

const {
  getAllCollections,
  getProductsByCollection,
  getProductById,
  updateProduct,
  markAsOptimized
} = require("../services/shopify");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SHOP_URL = `https://${req.headers["x-shopify-url"]}`;

// =============================================================
// 🧮 SCORE SEO
// =============================================================
function computeSeoScore({ description, metaTitle, metaDescription }) {
  let score = 0;

  const text = description.replace(/<[^>]*>/g, " ");
  const words = text.trim().split(/\s+/).length;

  if (words > 300) score += 20;
  if (/<h2/i.test(description)) score += 15;
  if (/<h3/i.test(description)) score += 10;
  if ((description.match(/href="\/collections\//g) || []).length >= 1) score += 8;
  if ((description.match(/href="\/products\//g) || []).length >= 1) score += 7;
  if (/(wikipedia|inserm|futura-sciences)/i.test(description)) score += 10;
  if (metaTitle) score += 15;
  if (metaDescription) score += 15;

  return Math.min(score, 100);
}

// =============================================================
// 🔥 ROUTE — OPTIMISATION SEO PRODUIT
// =============================================================
router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ error: "Missing productId" });
    }

    // Produit
    const product = await getProductById(req, productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Anti double optimisation
    if (product.tags?.includes("optimized")) {
      return res.json({
        success: true,
        alreadyOptimized: true,
        message: "Produit déjà optimisé"
      });
    }

    // Collection + produits liés
    const collections = await getAllCollections(req);
    let selectedCollection = null;
    let relatedProducts = [];

    for (const col of collections) {
      const prods = await getProductsByCollection(req, col.id);
      if (prods.some(p => p.id == productId)) {
        selectedCollection = col;
        relatedProducts = prods.filter(p => p.id != productId);
        break;
      }
    }

    const collectionUrl = selectedCollection
      ? `${SHOP_URL}/collections/${selectedCollection.handle}`
      : "Aucune";

    const relatedLink = relatedProducts[0]
      ? `${SHOP_URL}/products/${relatedProducts[0].handle}`
      : "";

    // =========================================================
    // 🧠 PROMPT SEO (TES INTENTIONS CONSERVÉES)
    // =========================================================
    const prompt = `
Tu es un expert SEO Shopify spécialisé dans la rédaction de descriptions produits orientées conversion.

Structure obligatoire :
<h2>{{PRODUCT_NAME}}</h2>
<p>Introduction avec lien vers la collection : <a href="${collectionUrl}">${selectedCollection?.title || "Collection"}</a></p>
<p>Lien vers un produit recommandé : ${relatedLink}</p>

<h3>Pourquoi choisir ce produit ?</h3>
<ul>
<li>Bénéfice clair</li>
<li>Bénéfice clair</li>
<li>Bénéfice clair</li>
<li>Bénéfice clair</li>
<li>Bénéfice clair</li>
</ul>

<p>
Deux paragraphes détaillés + 1 lien externe fiable
(Wikipédia, Inserm ou Futura-Sciences).
</p>

<p>Conclusion émotionnelle.</p>

Produit : ${product.title}

Description actuelle :
${product.body_html || "Aucune"}

Réponse JSON STRICTE :
{
  "title": "",
  "meta_title": "",
  "meta_description": "",
  "description_html": ""
}
`;

    // IA
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }]
    });

    let raw = ai.choices[0].message.content.trim();
    raw = raw.replace(/```json/g, "").replace(/```/g, "");
    const seo = JSON.parse(raw);

    // Score SEO
    const seoScore = computeSeoScore({
      description: seo.description_html,
      metaTitle: seo.meta_title,
      metaDescription: seo.meta_description
    });

    // Update contenu
    await updateProduct(req, productId, {
      title: seo.title || product.title,
      body_html: seo.description_html
    });

    // Update meta SEO Shopify
    await fetch(
      `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2024-01/products/${productId}.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": req.headers["x-shopify-token"],
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          product: {
            id: productId,
            seo_title: seo.meta_title,
            seo_description: seo.meta_description
          }
        })
      }
    );

    // Tag optimisé
    await markAsOptimized(req, productId);

    return res.json({
      success: true,
      optimized: true,
      score: seoScore,
      seo
    });

  } catch (err) {
    console.error("❌ SEO optimize error:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// =============================================================
// 🔥 ROUTE — OPTIMISATION SEO EN MASSE (BATCH SÉCURISÉ)
// =============================================================
router.post("/optimize-batch", async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds) || !productIds.length) {
      return res.status(400).json({ error: "productIds requis" });
    }

    const results = [];
    const batchSize = 10;

    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);

      for (const productId of batch) {
        try {
          const r = await fetch(
            `${process.env.SERVER_URL}/api/optimize-product`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-shopify-url": req.headers["x-shopify-url"],
                "x-shopify-token": req.headers["x-shopify-token"]
              },
              body: JSON.stringify({ productId })
            }
          );

          const json = await r.json();
          results.push({ productId, success: true, score: json.score });

        } catch (err) {
          results.push({ productId, success: false });
        }
      }

      // Pause sécurité
      if (i + batchSize < productIds.length) {
        await new Promise(r => setTimeout(r, 30000));
      }
    }

    return res.json({
      success: true,
      total: productIds.length,
      results
    });

  } catch (err) {
    console.error("❌ optimize-batch error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// =============================================================
module.exports = router;
