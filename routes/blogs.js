const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

const {
    getAllBlogs,
    getArticlesByBlog,
    createBlogArticle,
    getAllProducts,
    getAllCollections,
    getProductsByCollection
} = require("../services/shopify");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/* -------------------------------------------------------------
   GET /blogs
-------------------------------------------------------------- */
router.get("/blogs", async (req, res) => {
    try {
        const blogs = await getAllBlogs();

        const blogsWithArticles = await Promise.all(
            blogs.map(async (b) => {
                const articles = await getArticlesByBlog(b.id);
                return {
                    ...b,
                    articles_count: articles.length,
                    articles: articles.map(a => ({
                        id: a.id,
                        title: a.title,
                        handle: a.handle,
                        created_at: a.created_at,
                        url: `https://${process.env.SHOPIFY_SHOP_URL}/blogs/${b.handle}/${a.handle}`
                    }))
                };
            })
        );

        res.json({ success: true, blogs: blogsWithArticles });

    } catch (error) {
        console.error("❌ Error /blogs", error);
        res.status(500).json({ error: error.message });
    }
});

/* -------------------------------------------------------------
   GET /blogs/:blogId/articles
-------------------------------------------------------------- */
router.get("/blogs/:blogId/articles", async (req, res) => {
    try {
        const { blogId } = req.params;
        const articles = await getArticlesByBlog(blogId);

        res.json({ success: true, articles });

    } catch (error) {
        console.error("❌ Error /blogs/:blogId/articles", error);
        res.status(500).json({ error: error.message });
    }
});

/* -------------------------------------------------------------
   POST /blogs/create
-------------------------------------------------------------- */
router.post("/blogs/create", async (req, res) => {
    try {
        const { blogId, topic, scheduleDate } = req.body;

        if (!blogId || !topic) {
            return res.status(400).json({ error: "Missing blogId or topic" });
        }

        // Produits & collections
        const collections = await getAllCollections();
        const products = await getAllProducts();

        // Choisir une collection liée
        const relatedCollection =
            collections.find(c =>
                c.title.toLowerCase().includes(topic.toLowerCase())
            ) || collections[0];

        const collectionProducts = await getProductsByCollection(relatedCollection.id);

        // Bloc HTML produits
        const productGridHTML = collectionProducts.slice(0, 4).map(p => `
            <div class="blog-product-card">
                <div class="blog-product-badge">Promo</div>
                <div class="blog-product-image-wrapper">
                    <img src="${p?.image?.src || ''}" class="blog-product-image">
                </div>
                <div class="blog-product-content">
                    <h3>${p.title}</h3>
                    <p>${(p.body_html || '').replace(/<[^>]*>/g, '').slice(0,120)}...</p>
                    <a href="/products/${p.handle}" class="blog-product-cta">Voir</a>
                </div>
            </div>
        `).join("");

        const fullShowcaseHTML = `
            <div class="blog-products-showcase">
                <h2>Produits recommandés</h2>
                <div class="blog-products-grid">${productGridHTML}</div>
            </div>
        `;

        // Prompt IA
        const prompt = `
Tu es un expert en rédaction SEO Shopify.

Rédige un article de 800-1200 mots sur :
"${topic}"

Règles :
- HTML propre (pas de Markdown)
- H2 / H3 optimisés SEO
- Introduction + Conclusion
- Un lien externe fiable (Wikipedia / Ameli / Inserm)
- Jamais dire que c’est généré par IA
- Pas d’emojis

À la FIN de l’article, insère ce bloc sans modification :

${fullShowcaseHTML}

Retourne UNIQUEMENT ce JSON :
{
  "title": "",
  "content_html": ""
}
`;

        const ai = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.7,
            messages: [{ role: "user", content: prompt }]
        });

        let output = ai.choices[0].message.content.trim();
        output = output.replace(/```json|```/g, "").trim();

        const json = JSON.parse(output);

        const newArticle = {
            title: json.title,
            body_html: json.content_html,
            published_at: scheduleDate || null
        };

        const created = await createBlogArticle(blogId, newArticle);

        res.json({ success: true, created });

    } catch (error) {
        console.error("❌ Error /blogs/create", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
