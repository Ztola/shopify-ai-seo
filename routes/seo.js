const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

const {
  getProductById,
  updateProduct,
  markAsOptimized,
  isAlreadyOptimized
} = require("../services/shopify");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================================================
   🔥 ROUTE — OPTIMISATION PRODUIT (SAFE BOOT)
========================================================= */
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

    /* =====================================================
       🧠 PROMPT SEO — INCHANGÉ (TON PROMPT)
    ===================================================== */
    const prompt = `
Tu es un expert SEO Shopify spécialisé dans la rédaction de descriptions produits orientées conversion.

Ta mission : générer une description HTML complète au même style, même structure et même logique que l’exemple suivant, mais totalement adaptée au produit donné :

<h2>${product.title} Ajoutez le mot-clé principal au titre SEO.</h2>

<p>
Introduction avec ajoute d'encre optimiser avec lien vers la collection.
</p>

<p>
Paragraphe long avec encre optimisé.
</p>

<h3>Pourquoi choisir ce produit ?</h3>

<ul>
<li>Bénéfice clair et concret.</li>
<li>Bénéfice clair et concret.</li>
<li>Bénéfice clair et concret.</li>
<li>Bénéfice clair et concret.</li>
</ul>

<p>
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

    /* =====================================================
       🤖 APPEL IA (PROTÉGÉ)
    ===================================================== */
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }]
    });

    let raw = ai.choices[0].message.content.trim();
    raw = raw.replace(/```json/g, "").replace(/```/g, "");

    let seo;
    try {
      seo = JSON.parse(raw);
    } catch {
      throw new Error("JSON IA invalide");
    }

    await updateProduct(req, productId, {
      title: seo.title || product.title,
      body_html: seo.description_html
    });

    await markAsOptimized(req, productId);

    return res.json({
      success: true,
      optimized: true
    });

  } catch (err) {
    console.error("❌ optimize-product:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
