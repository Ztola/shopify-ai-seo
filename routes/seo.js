// -------------------------------------------------------
// POST /api/optimize-product (SEO COMPLET)
// -------------------------------------------------------
router.post("/optimize-product", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId)
      return res.status(400).json({ error: "Missing productId" });

    const product = await getProductById(productId);

    if (!product)
      return res.status(404).json({ error: "Product not found" });

    const prompt = `
Tu es un expert SEO Shopify.

⚠️ IMPORTANT — NE RENVOIE QUE DU JSON PUR.  
Aucun texte avant ou après.  
Aucun \`\`\`json, aucun markdown, aucun commentaire.  

Optimise le produit selon ces règles :

- Détecte automatiquement un mot-clé principal.
- Ajoute ce mot-clé dans : titre SEO, H1, H2, H3, meta description, intro.
- Description entre 600 et 800 mots.
- Slug < 75 caractères, sans accents ni espaces.
- Densité mot-clé ≈ 1%.
- Paragraphe court pour la lisibilité.
- Une seule image avec alt contenant le mot-clé.
- Un seul lien interne vers /collections/moto ou /collections/casque-moto.
- AUCUN lien externe.
- NE JAMAIS ajouter : "Description optimisée automatiquement", "version optimisée", emojis, etc.
- Le titre doit rester propre : pas d’emojis.

Retourne *uniquement* ce JSON PUR :

{
 "keyword": "",
 "title": "",
 "slug": "",
 "meta_title": "",
 "meta_description": "",
 "description_html": ""
}

Voici les données du produit :

TITRE : ${product.title}
DESCRIPTION : ${product.body_html}
    `;

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    let output = ai.choices[0].message.content.trim();

    // 🔥 Nettoyage anti-erreur JSON
    output = output.replace(/```json/gi, "");
    output = output.replace(/```/g, "");
    output = output.trim();

    let json = JSON.parse(output);

    // Mise à jour Shopify
    await updateProduct(productId, {
      title: json.title,
      body_html: json.description_html,
      handle: json.slug,
      metafields: [
        {
          key: "meta_title",
          namespace: "seo",
          value: json.meta_title,
          type: "single_line_text_field"
        },
        {
          key: "meta_description",
          namespace: "seo",
          value: json.meta_description,
          type: "multi_line_text_field"
        }
      ]
    });

    await markAsOptimized(productId);

    res.json({
      success: true,
      ...json,
      message: "Produit optimisé avec succès"
    });

  } catch (error) {
    console.error("❌ Error optimize-product:", error);
    res.status(500).json({
      error: "Optimize error",
      details: error.message
    });
  }
});
