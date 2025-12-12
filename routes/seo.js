// =============================================================
// 🧠 SEO.JS — VERSION FINALE STABLE (BUG DOMAINE CORRIGÉ)
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
    // ✅ BOUTIQUE ACTIVE (PLUS JAMAIS .env)
    const SHOP_URL = `https://${req.headers["x-shopify-url"]}`;

    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ error: "Missing productId" });
    }

    // Produit Shopify
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

    // Recherche collection + produits liés
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

    // ✅ MAILLAGE INTERNE — TOUJOURS BON DOMAINE
    const collectionUrl = selectedCollection
      ? `${SHOP_URL}/collections/${selectedCollection.handle}`
      : "";

    const relatedProductUrl = relatedProducts[0]
      ? `${SHOP_URL}/products/${relatedProducts[0].handle}`
      : "";

    // =========================================================
    // 🧠 PROMPT SEO (INTENTION CONSERVÉE)
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

    // Update contenu produit
    await updateProduct(req, productId, {
      title: seo.title || product.title,
      body_html: seo.description_html
    });

    // Update META SEO Shopify
    await fetch(
      `https://${req.headers["x-shopify-url"]}/admin/api/2024-01/products/${productId}.json`,
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

// =============================================================
module.exports = router;
