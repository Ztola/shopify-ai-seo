// =============================================================
// 🧠 SEO.JS — STRUCTURE CORRIGÉE (PROMPT SEO INTACT)
// =============================================================

const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");
const axios = require("axios");

const {
  getAllCollections,
  getProductsByCollection,
  getProductById,
  updateProduct,
  markAsOptimized,
  isAlreadyOptimized
} = require("../services/shopify");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// =============================================================
// 🧮 SCORE SEO (INCHANGÉ)
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
    const { productId, force } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, error: "Missing productId" });
    }

    const product = await getProductById(req, productId);
    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    if (!force) {
      const already = await isAlreadyOptimized(req, productId);
      if (already) {
        return res.json({ success: true, alreadyOptimized: true });
      }
    }

    // =========================================================
    // 🔎 COLLECTION + PRODUIT LIÉ (INCHANGÉ)
    // =========================================================
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

    const shopDomain = req.headers["x-shopify-url"];
    const collectionUrl = selectedCollection
      ? `https://${shopDomain}/collections/${selectedCollection.handle}`
      : `https://${shopDomain}/collections/all`;

    const relatedProductUrl = relatedProducts[0]
      ? `https://${shopDomain}/products/${relatedProducts[0].handle}`
      : "";

    // =========================================================
    // 🧠 PROMPT SEO — ⚠️ STRICTEMENT INCHANGÉ ⚠️
    // =========================================================
    const prompt = `
Tu es un expert SEO Shopify spécialisé dans la rédaction de descriptions produits orientées conversion.

Ta mission : générer une description HTML complète au même style, même structure et même logique que l’exemple suivant, mais totalement adaptée au produit donné :

<h2>${product.title} Ajoutez le mot-clé principal au titre SEO.</h2>

<p>
Introduction avec ajoute d'encre optimiser avec lien vers la collection :
<a href="${collectionUrl}">${selectedCollection?.title || "Notre collection"}</a>
</p>

<p>
Paragraphe long avec encre optimiséLien interne vers un produit recommandé :
<a href="${relatedProductUrl}">${relatedProducts[0]?.title || ""}</a>
</p>

<h3>Pourquoi choisir ce produit ?</h3>

<ul>
<li>Bénéfice clair et concret.</li>
<li>Bénéfice clair et concret.</li>
<li>Bénéfice clair et concret.</li>
<li>Bénéfice clair et concret.</li>
</ul>

<p>
Deux paragraphes détaillés sur l’usage et le confort.
Inclure 1 lien externe fiable (Wikipédia, Inserm ou Futura-Sciences).
</p>

<p>Conclusion émotionnelle incitant à l’achat.</p>

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

    // =========================================================
    // 🤖 OPENAI
    // =========================================================
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }]
    });

    const raw = ai.choices[0].message.content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const seo = JSON.parse(raw);

    const seoScore = computeSeoScore({
      description: seo.description_html,
      metaTitle: seo.meta_title,
      metaDescription: seo.meta_description
    });

    // =========================================================
    // ✍️ UPDATE SHOPIFY
    // =========================================================
    await updateProduct(req, productId, {
      title: seo.title || product.title,
      body_html: seo.description_html
    });

    await axios.put(
      `https://${shopDomain}/admin/api/2024-01/products/${productId}.json`,
      {
        product: {
          id: productId,
          seo_title: seo.meta_title,
          seo_description: seo.meta_description
        }
      },
      {
        headers: {
          "X-Shopify-Access-Token": req.headers["x-shopify-token"],
          "Content-Type": "application/json"
        }
      }
    );

    await markAsOptimized(req, productId);

    return res.json({
      success: true,
      optimized: true,
      score: seoScore
    });

  } catch (err) {
    console.error("❌ SEO optimize error:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
