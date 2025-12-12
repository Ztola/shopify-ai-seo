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
// 🧠 SEO.JS — VERSION FINALE STABLE & SEO-READY
// =============================================================

const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

const {
  getAllCollections,
  getProductsByCollection,
  getProductById,
  updateProduct,
  markAsOptimized,
  getAllBlogs,
  getArticlesByBlog
} = require("../services/shopify");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SHOP_URL = `https://${process.env.SHOPIFY_SHOP_URL}`;

// =============================================================
// 🔥 ROUTE — OPTIMISATION SEO PRODUIT
// =============================================================
router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ error: "Missing productId" });
    }

    // 1️⃣ Récupération produit Shopify (multi-boutique OK)
    const product = await getProductById(req, productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // 2️⃣ Trouver la collection du produit
    const collections = await getAllCollections(req);
    let selectedCollection = null;
    let relatedProducts = [];

    for (const col of collections) {
      const products = await getProductsByCollection(req, col.id);
      if (products.some(p => p.id == productId)) {
        selectedCollection = col;
        relatedProducts = products.filter(p => p.id != productId);
        break;
      }
    }

    const collectionUrl = selectedCollection
      ? `${SHOP_URL}/collections/${selectedCollection.handle}`
      : "Aucune";

    const relatedLinks = relatedProducts.slice(0, 3).map(p => ({
      title: p.title,
      url: `${SHOP_URL}/products/${p.handle}`
    }));

    // =========================================================
    // 🧠 PROMPT SEO — CONSERVÉ (STRUCTURE & INTENTION)
    // =========================================================
    const prompt = `
Tu es un expert SEO Shopify spécialisé dans la rédaction de descriptions produits orientées conversion.

Ta mission : générer une description HTML complète, optimisée SEO, structurée, humaine, fluide, sans keyword stuffing.

=== STRUCTURE OBLIGATOIRE ===

<h2><strong>{{PRODUCT_NAME}}</strong> : confort, performance et usage quotidien</h2>

<p>
Introduction mettant en avant le bénéfice principal.
Inclure un lien interne vers la collection liée :
<a href="${collectionUrl}">${selectedCollection?.title || "Notre collection"}</a>.
</p>

<p>
Inclure UN lien interne vers un produit recommandé :
${relatedLinks.length ? `<a href="${relatedLinks[0].url}">${relatedLinks[0].title}</a>` : ""}
</p>

<h3>Pourquoi choisir <strong>{{PRODUCT_NAME}}</strong> ?</h3>

<ul>
<li><strong>Bénéfice 1</strong> : explication claire.</li>
<li><strong>Bénéfice 2</strong> : explication claire.</li>
<li><strong>Bénéfice 3</strong> : explication claire.</li>
<li><strong>Bénéfice 4</strong> : explication claire.</li>
<li><strong>Bénéfice 5</strong> : explication claire.</li>
</ul>

<p>
Deux paragraphes détaillés sur l’usage, le confort, l’ergonomie.
Inclure 1 lien externe fiable (Wikipédia, Inserm ou Futura-Sciences).
</p>

<p>Conclusion émotionnelle incitant à l’achat.</p>

🔥 Produit :
${product.title}

🔥 Description originale :
${product.body_html || "Aucune"}

🔥 Réponse JSON STRICTE :
{
  "title": "",
  "meta_title": "",
  "meta_description": "",
  "description_html": ""
}
`;

    // =========================================================
    // 🧠 APPEL OPENAI
    // =========================================================
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }]
    });

    let raw = ai.choices[0].message.content.trim();
    raw = raw.replace(/```json/g, "").replace(/```/g, "");

    const seo = JSON.parse(raw);

    const seoScore = computeSeoScore({
  description: seo.description_html,
  metaTitle: seo.meta_title,
  metaDescription: seo.meta_description
});

    // =========================================================
    // 🛠️ UPDATE SHOPIFY — CONTENU
    // =========================================================
    await updateProduct(req, productId, {
      title: seo.title || product.title,
      body_html: seo.description_html
    });

    // =========================================================
    // 🛠️ UPDATE SHOPIFY — META SEO (IMPORTANT)
    // =========================================================
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

    // =========================================================
    // 🟢 MARQUER COMME OPTIMISÉ
    // =========================================================
    await markAsOptimized(req, productId);

    return res.json({
      success: true,
      optimized: true,
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

return res.json({
  success: true,
  optimized: true,
  score: seoScore
});

// =============================================================
// 🔥 EXPORT
// =============================================================
module.exports = router;
