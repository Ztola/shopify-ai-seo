const axios = require("axios");

async function optimizeProduct(product, collection = null) {
  let collectionName = "";
  let keyword = "";

  if (collection) {
    collectionName = collection.title;

    const clean = collection.title
      .replace(/collection|promo|officiel|produits/gi, "")
      .trim();

    keyword = clean.split(" ")[0];
  }

  const prompt = `
Optimise ce produit Shopify en te basant sur :

Titre : ${product.title}
Description actuelle : ${product.body_html}
Collection : ${collectionName}
Mot clé principal : ${keyword}

Objectifs :
1. Génère un titre optimisé SEO
2. Réécris une description complète en H2/H3
3. Intègre le mot-clé principal (${keyword})
4. Ajoute un maillage interne :
   "Découvrez plus dans notre collection ${collectionName}" avec le lien :
   /collections/${collection?.handle ?? ""}
5. Génère une meta description SEO (155 caractères)
`;

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  const text = response.data.choices[0].message.content;

  return {
    title: product.title,
    body_html: text
  };
}

module.exports = { optimizeProduct };
