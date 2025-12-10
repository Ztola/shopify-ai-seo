// 🔥 Prompt IA
    const prompt = `
Tu es un expert SEO Shopify spécialisé dans la rédaction de descriptions produits orientées conversion.

Ta mission : générer une description HTML complète au même style, même structure et même logique que l’exemple suivant, mais totalement adaptée au produit donné :

=== EXEMPLE DE STYLE À REPRODUIRE ===

<h2><strong>{{PRODUCT_NAME}}™</strong> | <strong>{{CATEGORY_NAME}}</strong> : Confort supérieur et maintien avancé</h2>

<p>
Introduction présentant le bénéfice principal, incluant deux liens internes :
– Un lien vers une collection liée.
<p>
Ajoute un lien interne obligatoire vers un produit recommandé.
</p>
Description centrée sur le confort, le soutien, l'élégance et l’usage quotidien.
</p>

<h3>Redécouvrez le confort et la stabilité avec les <strong>{{PRODUCT_NAME}}™</strong></h3>

<ul>
    <li><strong>Bénéfice 1</strong> : Explication claire.</li>
    <li><strong>Bénéfice 2</strong> : Explication claire.</li>
    <li><strong>Bénéfice 3</strong> : Explication claire.</li>
    <li><strong>Bénéfice 4</strong> : Explication claire.</li>
    <li><strong>Bénéfice 5</strong> : Explication claire.</li>
    <li><strong>Bénéfice 6</strong> : Explication claire.</li>
</ul>

<p>
Deux paragraphes de développement expliquant :
– La réduction de la douleur.
– Le confort quotidien.
– Les usages possibles (ville, travail, marche…).
– Le soutien ergonomique.
</p>
<p>
Inclure également 1 lien externes fiables comme :
– Ameli (santé)
– Inserm / Wikipédia (source scientifique)
- Futura-Science
❗ RÈGLE IMPORTANTE : Le maillage externe doit traiter EXACTEMENT du sujet lié au mot-clé principal ou à la collection (ex. douleurs plantaires, marche, fasciite plantaire, soutien orthopédique, semelles, biomécanique…).  
N'inclure AUCUN lien externe qui n’est pas en rapport direct avec le thème.
</p>

<p>
Conclusion émotionnelle valorisant :
– La nécessité d’acheter dès maintenant
</p>

Contraintes :

– Ne jamais copier la description d’origine : tout doit être reformulé.
– HTML propre uniquement.

🔥 DONNÉES DU PRODUIT :
TITRE : ${product.title}
DESCRIPTION ORIGINALE : ${product.body_html}

🔥 COLLECTION DU PRODUIT :
Nom : ${selectedCollection ? selectedCollection.title : "Aucune"}
URL : ${collectionUrl || "Aucune"}

🔥 PRODUITS DE LA COLLECTION POUR MAILLAGE INTERNE :
${productsWithUrls.map((p) => `- ${p.title} : ${p.url}`).join("\n")}

🔥 Format de réponse OBLIGATOIRE (JSON uniquement) :
{
  "keyword": "",
  "title": "",
  "slug": "",
  "meta_title": "",
  "meta_description": "",
  "description_html": ""
}
    `;

    // 🔥 Appel IA
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4
    });

    let output = ai.choices[0].message.content.trim();

    // Nettoyage
    output = output.replace(/```json/g, "").replace(/```/g, "").trim();

    let json;
    try {
      json = JSON.parse(output);
    } catch (err) {
      console.error("❌ JSON AI error", output);
      return res.status(500).json({ error: "Invalid JSON", raw: output });
    }

    // 🔥 Mise à jour Shopify
    await updateProduct(productId, {
      id: productId,
      title: json.title,
      handle: json.slug,
      body_html: json.description_html
    });

    // 🔥 Marquer comme optimisé
    await markAsOptimized(productId);

    res.json({
      success: true,
      optimized: true,
      productId,
      ...json
    });

  } catch (error) {
    console.error("❌ Error /optimize-product", error);
    res.status(500).json({
      error: "Optimize error",
      details: error.message
    });
  }
});
