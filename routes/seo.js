const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ error: "Missing 'productId' in body" });
    }

    console.log("🔎 Fetching product:", productId);

    // --- Récupération du produit Shopify ---
    const product = await getProductById(productId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const title = product.title;
    const description = product.body_html;

    // -----------------------------------------
    // GPT-4o : Optimisation SEO complète
    // -----------------------------------------
    const prompt = `
Je suis un expert SEO Shopify. Optimise le produit suivant :

TITRE :
${title}

DESCRIPTION :
${description}

EXIGENCES SEO (OBLIGATOIRES) :
- Définir UN MOT-CLÉ PRINCIPAL.
- Utiliser le mot-clé au début du titre SEO.
- Ajouter un power word dans le titre.
- Créer une Meta Description contenant le mot-clé (max 160 caractères).
- Créer une URL SEO (max 75 caractères, tirets).
- Réécrire une description HTML longue (600+ mots).
- Le mot-clé doit être utilisé :
  • Au début du contenu  
  • Dans plusieurs paragraphes  
  • Densité ≈ 1%  
  • Dans les H2 et H3  
- Ajouter un ALT image contenant le mot-clé.
- Ajouter un lien interne (maillage interne) vers une collection générique.
- Ajouter un lien externe fiable (Wikipedia, Ameli, etc.)
- Paragraphes courts, lisibles.
- Ton professionnel + storytelling léger.
- Pas de duplication, générer un texte original.

Réponds STRICTEMENT au format JSON suivant :

{
  "keyword": "...",
  "seo_title": "...",
  "seo_description": "...",
  "seo_url": "...",
  "optimized_description_html": "...",
  "internal_link": {
    "label": "...",
    "url": "..."
  },
  "external_link": {
    "label": "...",
    "url": "..."
  }
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Tu es un expert SEO Shopify." },
        { role: "user", content: prompt }
      ]
    });

    const output = JSON.parse(completion.choices[0].message.content);

    res.json({
      success: true,
      productId,
      original: {
        title,
        description
      },
      optimized: output
    });

  } catch (error) {
    console.error("❌ Error /optimize-product:", error);
    res.status(500).json({
      error: "Product SEO optimization failed",
      details: error.message
    });
  }
});
