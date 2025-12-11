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
   Liste tous les blogs Shopify
-------------------------------------------------------------- */
router.get("/blogs", async (req, res) => {
    try {
        const blogs = await getAllBlogs();

        const result = await Promise.all(
            blogs.map(async (b) => {
                const articles = await getArticlesByBlog(b.id);

                return {
                    ...b,
                    articles_count: articles.length,
                    url_base: process.env.SHOPIFY_SHOP_URL,
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

        res.json({ success: true, blogs: result });
    } catch (error) {
        console.error("❌ Error /blogs", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* -------------------------------------------------------------
   🔥 ROUTE 2 : GET /blogs/:blogId/articles
-------------------------------------------------------------- */
router.get("/blogs/:blogId/articles", async (req, res) => {
    try {
        const { blogId } = req.params;
        const articles = await getArticlesByBlog(blogId);
        res.json({ success: true, articles });
    } catch (error) {
        console.error("❌ Error /blogs/:id/articles", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* -------------------------------------------------------------
   🔥 ROUTE 3 : POST /blogs/create
   Génère et publie un article automatique
-------------------------------------------------------------- */
router.post("/blogs/create", async (req, res) => {
    try {
        const { blogId, topic, scheduleDate } = req.body;

        if (!blogId || !topic) {
            return res.status(400).json({ success: false, error: "Missing parameters" });
        }

        const products = await getAllProducts();
        const collections = await getAllCollections();

        const relatedCollection =
            collections.find(c =>
                c.title.toLowerCase().includes(topic.toLowerCase())
            ) || collections[0];

        const collectionProducts = await getProductsByCollection(relatedCollection.id);

        const prompt = `
Tu es un expert en rédaction SEO Shopify.
Rédige un article HTML optimisé sur :
"${topic}"
800-1200 mots, H2/H3, pas d’emojis.
        `;

        const ai = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
        });

        const raw = ai.choices[0].message.content.trim();
        const json = JSON.parse(raw.replace(/```json|```/g, ""));

        const article = {
            title: json.title,
            body_html: json.content_html,
            published_at: scheduleDate || null
        };

        const created = await createBlogArticle(blogId, article);

        res.json({ success: true, created });

    } catch (error) {
        console.error("❌ Error /blogs/create", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* -------------------------------------------------------------
   🔥 AUTOMATISATION (activation / désactivation / CRON)
   → ON L'AJOUTERA ICI APRÈS CONFIRMATION
-------------------------------------------------------------- */

module.exports = router;
