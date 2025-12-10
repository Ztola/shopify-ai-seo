const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

// Shopify Services
const {
    getAllBlogs,
    getArticlesByBlog,
    createBlogArticle,
    getAllProducts,
    getAllCollections
} = require("../services/shopify");

// OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/* -------------------------------------------------------------
   🔥 ROUTE 1 : GET /blogs
   Récupère tous les blogs Shopify
-------------------------------------------------------------- */
router.get("/blogs", async (req, res) => {
    try {
        const blogs = await getAllBlogs();
        res.json({ success: true, blogs });
    } catch (error) {
        console.error("❌ Error /blogs", error);
        res.status(500).json({ error: error.message });
    }
});

/* -------------------------------------------------------------
   🔥 ROUTE 2 : GET /blogs/:blogId/articles
   Récupère les articles d’un blog
-------------------------------------------------------------- */
router.get("/blogs/:blogId/articles", async (req, res) => {
    try {
        const { blogId } = req.params;
        const articles = await getArticlesByBlog(blogId);
        res.json({ success: true, articles });
    } catch (error) {
        console.error("❌ Error /articles", error);
        res.status(500).json({ error: error.message });
    }
});

/* -------------------------------------------------------------
   🔥 ROUTE 3 : POST /blogs/create
   Crée un article automatique avec IA + Shopify
-------------------------------------------------------------- */
router.post("/blogs/create", async (req, res) => {
    try {
        const { blogId, topic, scheduleDate } = req.body;

        if (!blogId || !topic) {
            return res.status(400).json({ error: "Missing blogId or topic" });
        }

        // Récupération produits / collections
        const products = await getAllProducts();
        const collections = await getAllCollections();

        // Choisir un produit pertinent pour le maillage interne
        const randomProduct = products[Math.floor(Math.random() * products.length)];
        const randomCollection = collections[Math.floor(Math.random() * collections.length)];

        // Prompt IA pour générer le blog
        const prompt = `
Tu es un expert en rédaction SEO Shopify.

Rédige un article de blog optimisé de 800 à 1200 mots sur le sujet :
"${topic}"

INSTRUCTIONS STRICTES :
- Ton humain + professionnel
- Pas d’emoji
- Ajouter une introduction et une conclusion
- Ajouter H2 + H3
- Ajouter un lien interne produit : /products/${randomProduct.handle}
- Ajouter un lien interne collection : /collections/${randomCollection.handle}
- Ajouter un lien externe fiable (Wikipedia, Ameli ou Inserm)
- Ajouter un bloc HTML <div class="product-banner"> avec image du produit :
  <img src="${randomProduct.image?.src}" alt="${randomProduct.title}">
- Ajouter un CTA orienté conversion en bas de page
- Ne jamais dire que c'est généré par une IA
- Pas de markdown, uniquement HTML propre et validé

RENVOIE UNIQUEMENT CE JSON :
{
  "title": "",
  "content_html": ""
}
        `;

        const ai = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
        });

        let output = ai.choices[0].message.content.trim();
        output = output.replace(/```json|```/g, "").trim();

        let json = JSON.parse(output);

        const newArticle = {
            title: json.title,
            body_html: json.content_html,
            published_at: scheduleDate ?? null
        };

        const created = await createBlogArticle(blogId, newArticle);

        res.json({
            success: true,
            message: "Article généré et envoyé à Shopify",
            created
        });

    } catch (error) {
        console.error("❌ Error /blogs/create", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
