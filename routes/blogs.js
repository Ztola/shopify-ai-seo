const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

// Shopify Services
const {
    getAllBlogs,
    getArticlesByBlog,
    createBlogArticle,
    getAllProducts,
    getAllCollections,
    getProductsByCollection
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
   Crée un article automatique avec IA + produits liés
-------------------------------------------------------------- */
router.post("/blogs/create", async (req, res) => {
    try {
        const { blogId, topic, scheduleDate } = req.body;

        if (!blogId || !topic) {
            return res.status(400).json({ error: "Missing blogId or topic" });
        }

        // Récupération produits + collections
        const products = await getAllProducts();
        const collections = await getAllCollections();

        // Trouver la collection la plus liée au sujet
        const relatedCollection =
            collections.find(c =>
                c.title.toLowerCase().includes(topic.toLowerCase())
            ) || collections[0];

        // Produits de la collection
        const collectionProducts = await getProductsByCollection(relatedCollection.id);

        /* ------------------------------------------------------------------
           🔥 Génération du bloc HTML visuel premium (4 produits max)
        ------------------------------------------------------------------ */
        const productGridHTML = collectionProducts.slice(0, 4).map(p => `
            <div class="blog-product-card">
                <div class="blog-product-badge">Promo</div>
                <div class="blog-product-image-wrapper">
                    <img 
                        src="${p?.image?.src || ''}" 
                        alt="${p.title}"
                        class="blog-product-image"
                    >
                </div>
                <div class="blog-product-content">
                    <h3 class="blog-product-title">${p.title}</h3>
                    <p class="blog-product-description">
                        ${(p.body_html || "")
                            .replace(/<[^>]*>?/gm, "")
                            .slice(0, 120)
                        }...
                    </p>
                    <div class="blog-product-footer">
                        <div>
                            <span class="blog-product-price">${p?.variants?.[0]?.price || ""} €</span>
                        </div>
                        <a href="/products/${p.handle}" class="blog-product-cta">
                            Voir le produit
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                <polyline points="12 5 19 12 12 19"></polyline>
                            </svg>
                        </a>
                    </div>
                </div>
            </div>
        `).join("");

        const fullShowcaseHTML = `
            <div class="blog-products-showcase">
                <div class="blog-products-header">
                    <h2 class="blog-products-title">Produits Recommandés</h2>
                    <p class="blog-products-subtitle">Découvrez nos produits en lien avec cet article</p>
                </div>

                <div class="blog-products-grid">
                    ${productGridHTML}
                </div>
            </div>
        `;

        /* ------------------------------------------------------------------
           🔥 PROMPT IA FINAL
        ------------------------------------------------------------------ */
        const prompt = `
Tu es un expert en rédaction SEO Shopify.

Rédige un article de blog optimisé de 800 à 1200 mots sur le sujet :
"${topic}"

INSTRUCTIONS STRICTES :
- Ton professionnel, humain, expert, pédagogique.
- Structure ton article en HTML propre (PAS de Markdown).
- Ajoute une introduction et une conclusion.
- Ajoute des H2 + H3 clairs et optimisés SEO.
- Ajoute un lien externe fiable (Wikipedia, Ameli, Inserm).
- Ne dis jamais que l’article est généré par une IA.
- Pas d’emojis.
- HTML propre uniquement.

IMPORTANT :
À la fin de l’article, insère EXACTEMENT ce bloc HTML sans rien modifier :

${fullShowcaseHTML}

RENVOIE UNIQUEMENT CE JSON STRICT :
{
  "title": "",
  "content_html": ""
}
`;

        /* ------------------------------------------------------------------
           🔥 APPEL OPENAI
        ------------------------------------------------------------------ */
        const ai = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
        });

        let output = ai.choices[0].message.content.trim();
        output = output.replace(/```json|```/g, "").trim();

        const json = JSON.parse(output);

        /* ------------------------------------------------------------------
           🔥 CRÉATION SUR SHOPIFY
        ------------------------------------------------------------------ */
        const newArticle = {
            title: json.title,
            body_html: json.content_html,
            published_at: scheduleDate || null
        };

        const created = await createBlogArticle(blogId, newArticle);

        res.json({
            success: true,
            message: "Article généré avec bloc produits premium",
            created
        });

    } catch (error) {
        console.error("❌ Error /blogs/create", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
